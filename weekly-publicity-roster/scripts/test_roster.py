"""Synthetic regression tests. No real people or external services."""
import copy
import unittest
from roster import audit, candidate, prepare, solve

DATE = '2030-01-07'


def fixture(count=8):
    return {'dates': [DATE], 'timezone': 'Asia/Shanghai', 'people': [
        {'id': str(i), 'name': '示例' + str(i), 'days': {DATE: {
            'verified': True, 'source': 'synthetic full-day timetable',
            'course_windows': [['08:00', '22:00']], 'busy': []}}} for i in range(count)]}


def eligible(data, shift='deep_am', pid='0'):
    people, slots, policy, exclusions = prepare(data)
    return candidate(people[pid], slots[DATE + '|' + shift], policy, exclusions)


class RosterTests(unittest.TestCase):
    def test_full_day_coverage_and_no_overlap(self):
        data = fixture()
        result = solve(data, trials=30)
        self.assertEqual(audit(data, result)['shortage'], 0)
        am = {x['person_id'] for x in result['slots'][0]['assigned']}
        midday = {x['person_id'] for x in result['slots'][1]['assigned']}
        self.assertFalse(am & midday)
        self.assertEqual(result['summary']['assigned'], 12)

    def test_course_buffer_boundary(self):
        data = fixture(1)
        day = data['people'][0]['days'][DATE]
        day['busy'] = [['08:00', '09:50']]
        self.assertIsNotNone(eligible(data))
        day['busy'] = [['08:00', '09:51']]
        self.assertIsNone(eligible(data))
        day['busy'] = [['12:09', '13:00']]
        self.assertIsNone(eligible(data))

    def test_signup_union_and_exact_gap(self):
        data = fixture(1)
        day = data['people'][0]['days'][DATE]
        day['signup_windows'] = [['18:00', '20:00'], ['20:00', '22:00']]
        self.assertFalse(eligible(data, 'tent_evening')['pending'])
        day['signup_windows'] = [['18:00', '19:30'], ['20:00', '22:00']]
        entry = eligible(data, 'tent_evening')
        self.assertTrue(entry['pending'])
        self.assertEqual(entry['uncovered'], [['19:30', '20:00']])
        data['policy'] = {'allow_adjacent_signup': False}
        self.assertIsNone(eligible(data, 'tent_evening'))

    def test_signup_never_overrides_known_course(self):
        data = fixture(1)
        day = data['people'][0]['days'][DATE]
        day['signup_windows'] = [['10:00', '12:00']]
        day['busy'] = [['10:30', '11:00']]
        self.assertIsNone(eligible(data))

    def test_unknown_wrong_week_and_crop_not_free(self):
        data = fixture(1)
        day = data['people'][0]['days'][DATE]
        day['verified'] = False
        self.assertIsNone(eligible(data))
        day['verified'] = True
        day['course_windows'] = [['08:00', '11:30']]
        day['signup_windows'] = [['10:00', '12:00']]
        self.assertIsNone(eligible(data))
        del data['people'][0]['days'][DATE]
        self.assertIsNone(eligible(data))

    def test_explicit_unavailability_and_role(self):
        data = fixture(1)
        data['people'][0]['roles'] = ['tent']
        self.assertIsNone(eligible(data))
        self.assertIsNotNone(eligible(data, 'tent_pm'))
        data['people'][0]['days'][DATE]['unavailable'] = [['18:00', '18:05']]
        self.assertIsNone(eligible(data, 'tent_pm'))

    def test_shortage_and_incomplete_group_honest(self):
        result = solve(fixture(1), trials=10)
        self.assertGreater(result['summary']['shortage'], 0)
        self.assertTrue(any(s['incomplete_group'] for s in result['slots']))
        self.assertEqual(result['summary']['required_assignments'], 12)

    def test_exclusion_is_scoped_and_locks_preserved(self):
        data = fixture()
        data['exclusions'] = [{'person_id': '0', 'slot_id': DATE + '|deep_am'}]
        data['locked'] = [{'person_id': '0', 'slot_id': DATE + '|deep_pm'}]
        result = solve(data, trials=15)
        self.assertNotIn('0', [r['person_id'] for r in result['slots'][0]['assigned']])
        self.assertIn('0', [r['person_id'] for r in result['slots'][2]['assigned']])
        data['locked'].append({'person_id': '0', 'slot_id': DATE + '|deep_am'})
        with self.assertRaises(ValueError):
            solve(data)

    def test_user_caps_and_default_no_hard_cap(self):
        data = fixture(1)
        self.assertGreater(solve(data, trials=10)['workload'][0]['shifts'], 2)
        data['people'][0]['max_daily'] = 1
        self.assertEqual(solve(data, trials=10)['workload'][0]['shifts'], 1)
        data['people'][0]['max_weekly'] = 0
        self.assertEqual(solve(data, trials=10)['summary']['assigned'], 0)

    def test_tampered_evidence_counts_and_double_booking(self):
        data = fixture()
        result = solve(data, trials=15)
        tampered = copy.deepcopy(result)
        tampered['slots'][0]['assigned'][0]['pending'] = True
        with self.assertRaises(ValueError):
            audit(data, tampered)
        tampered = copy.deepcopy(result)
        tampered['summary']['shortage'] = 99
        with self.assertRaises(ValueError):
            audit(data, tampered)
        tampered = copy.deepcopy(result)
        tampered['slots'][1]['assigned'][0] = copy.deepcopy(tampered['slots'][0]['assigned'][0])
        with self.assertRaises(ValueError):
            audit(data, tampered)

    def test_extra_group_and_determinism(self):
        data = fixture(12)
        data['staffing'] = {DATE + '|deep_am': 6}
        first = solve(data, trials=15, seed=9)
        self.assertEqual(first, solve(data, trials=15, seed=9))
        self.assertEqual([x['group'] for x in first['slots'][0]['assigned']], ['A']*3 + ['B']*3)
        data['staffing'][DATE + '|deep_am'] = 4
        with self.assertRaises(ValueError):
            solve(data)

    def test_empty_roster_and_missing_availability(self):
        self.assertEqual(solve(fixture(0), trials=1)['summary']['shortage'], 12)
        data = fixture(1)
        del data['people'][0]['days'][DATE]['course_windows']
        self.assertIsNone(eligible(data))
        data['people'][0]['days'][DATE]['signup_windows'] = []
        self.assertIsNone(eligible(data))


if __name__ == '__main__':
    unittest.main(verbosity=2)
