"""Deterministic, standard-library roster search and audit; no OCR or network I/O."""
import argparse
import collections
import datetime as dt
import json
import random
from pathlib import Path

SHIFTS = [
    ('deep_am', '深入活动宣传组', '10:00', '12:00', 3),
    ('tent_midday', '棚子宣传组', '11:00', '13:00', 2),
    ('deep_pm', '深入活动宣传组', '15:00', '17:00', 3),
    ('tent_pm', '棚子宣传组', '17:00', '19:00', 2),
    ('tent_evening', '棚子宣传组', '19:00', '21:00', 2),
]
ROLES = {'deep', 'tent'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def minute(value):
    require(isinstance(value, str), 'Time must be HH:MM text')
    parts = value.split(':')
    require(len(parts) == 2 and all(x.isdigit() for x in parts), 'Invalid time: ' + value)
    h, m = map(int, parts)
    require(0 <= h <= 24 and 0 <= m < 60 and (h < 24 or m == 0), 'Invalid time: ' + value)
    return h * 60 + m


def clock(value):
    return f'{value // 60:02d}:{value % 60:02d}'


def intervals(values):
    require(isinstance(values, list), 'Intervals must be a list')
    pairs = []
    for pair in values:
        require(isinstance(pair, list) and len(pair) == 2, 'Interval must have start/end')
        a, b = map(minute, pair)
        require(a < b, 'Intervals must increase within one date')
        pairs.append((a, b))
    merged = []
    for a, b in sorted(pairs):
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    return merged


def overlaps(a, b, c, d):
    return a < d and c < b


def uncovered(a, b, windows):
    result, cursor = [], a
    for c, d in windows:
        if d <= cursor or c >= b:
            continue
        if c > cursor:
            result.append((cursor, min(c, b)))
        cursor = max(cursor, min(d, b))
    if cursor < b:
        result.append((cursor, b))
    return result


def prepare(data):
    require(isinstance(data, dict), 'Input must be an object')
    dates = data['dates']
    require(isinstance(dates, list) and dates and len(set(dates)) == len(dates), 'Dates must be unique')
    for date in dates:
        require(dt.date.fromisoformat(date).isoformat() == date, 'Use ISO dates')
    require(isinstance(data.get('timezone'), str) and data['timezone'].strip(), 'Explicit timezone required')
    policy = {'buffer_minutes': 10, 'allow_adjacent_signup': True,
              'adjacent_gap_minutes': 30, 'max_uncovered_minutes': 60}
    supplied = data.get('policy', {})
    require(set(supplied) <= set(policy), 'Unknown policy key')
    policy.update(supplied)
    require(type(policy['allow_adjacent_signup']) is bool, 'allow_adjacent_signup must be boolean')
    for key in ('buffer_minutes', 'adjacent_gap_minutes', 'max_uncovered_minutes'):
        require(type(policy[key]) is int and policy[key] >= 0, key + ' must be a nonnegative integer')
    people = {}
    for person in data['people']:
        pid = person['id']
        require(isinstance(pid, str) and pid and pid not in people, 'Person IDs must be unique nonempty text')
        require(isinstance(person.get('name'), str) and person['name'].strip(), 'Missing person name')
        roles = person.get('roles', ['deep', 'tent'])
        require(isinstance(roles, list) and set(roles) <= ROLES, 'Invalid role')
        for cap in ('max_daily', 'max_weekly'):
            require(person.get(cap) is None or (type(person[cap]) is int and person[cap] >= 0), 'Invalid ' + cap)
        for date, day in person.get('days', {}).items():
            require(date in dates, 'Evidence date outside target range: ' + date)
            require(type(day.get('verified', False)) is bool, 'verified must be boolean')
            if day.get('verified'):
                require(isinstance(day.get('source'), str) and day['source'].strip(), 'Verified day needs source')
            for field in ('course_windows', 'busy', 'unavailable', 'signup_windows'):
                if field in day:
                    intervals(day[field])
        people[pid] = person
    slots = {}
    staffing = data.get('staffing', {})
    for date in sorted(dates):
        for sid, role_name, start, end, minimum in SHIFTS:
            key = date + '|' + sid
            target = staffing.get(key, minimum)
            require(type(target) is int and (target in (3, 6) if sid.startswith('deep') else target >= 2),
                    'Invalid staffing target: ' + key)
            slots[key] = {'slot_id': key, 'date': date, 'shift_id': sid, 'role': sid.split('_')[0],
                          'role_name': role_name, 'start': start, 'end': end, 'required': target}
    require(set(staffing) <= set(slots), 'Unknown staffing slot')
    excluded = set()
    for field in ('exclusions', 'locked'):
        seen = set()
        for item in data.get(field, []):
            pair = (item['person_id'], item['slot_id'])
            require(pair[0] in people and pair[1] in slots, 'Unknown person or slot in ' + field)
            require(pair not in seen, 'Duplicate ' + field)
            seen.add(pair)
        if field == 'exclusions':
            excluded = seen
    return people, slots, policy, excluded


def candidate(person, slot, policy, excluded):
    pid, key = person['id'], slot['slot_id']
    if (pid, key) in excluded or slot['role'] not in person.get('roles', ['deep', 'tent']):
        return None
    day = person.get('days', {}).get(slot['date'], {})
    if not day.get('verified'):
        return None
    a, b = minute(slot['start']), minute(slot['end'])
    buffer = policy['buffer_minutes']
    for c, d in intervals(day.get('busy', [])):
        if overlaps(a, b, c - buffer, d + buffer):
            return None
    if any(overlaps(a, b, c, d) for c, d in intervals(day.get('unavailable', []))):
        return None
    if 'course_windows' not in day and 'signup_windows' not in day:
        return None
    basis, gaps = [], []
    if 'course_windows' in day:
        if uncovered(a, b, intervals(day['course_windows'])):
            return None  # A cropped/unknown course region cannot be inferred free.
        basis.append('课表无冲突')
    if 'signup_windows' in day:
        windows = intervals(day['signup_windows'])
        gaps = uncovered(a, b, windows)
        if gaps:
            distance = min((max(c - b, a - d, 0) for c, d in windows), default=float('inf'))
            if (not policy['allow_adjacent_signup'] or distance > policy['adjacent_gap_minutes']
                    or sum(d - c for c, d in gaps) > policy['max_uncovered_minutes']):
                return None
            basis.append('相邻报名推定，待本人确认')
        else:
            basis.append('报名覆盖')
    return {'person_id': pid, 'name': person['name'], 'pending': bool(gaps), 'basis': basis,
            'uncovered': [[clock(c), clock(d)] for c, d in gaps], 'source': day['source']}


def fits(pid, key, assignments, people, slots):
    person, slot = people[pid], slots[key]
    assigned = [s for s, ids in assignments.items() if pid in ids]
    if pid in assignments[key]:
        return False
    same_day = [s for s in assigned if slots[s]['date'] == slot['date']]
    if person.get('max_weekly') is not None and len(assigned) >= person['max_weekly']:
        return False
    if person.get('max_daily') is not None and len(same_day) >= person['max_daily']:
        return False
    a, b = minute(slot['start']), minute(slot['end'])
    return not any(overlaps(a, b, minute(slots[s]['start']), minute(slots[s]['end'])) for s in same_day)


def render(data, assignments, prepared):
    people, slots, policy, excluded = prepared
    output = {'dates': sorted(data['dates']), 'timezone': data['timezone'], 'policy': policy, 'slots': []}
    counts, pending_counts = collections.Counter(), collections.Counter()
    total_required = total_assigned = pending = shortage = 0
    for key, slot in slots.items():
        records = [candidate(people[pid], slot, policy, excluded) for pid in assignments[key]]
        require(all(x is not None for x in records), 'Ineligible assignment in ' + key)
        records.sort(key=lambda x: x['person_id'])
        for index, row in enumerate(records):
            row['group'] = chr(65 + index // 3) if slot['role'] == 'deep' else ''
            counts[row['person_id']] += 1
            pending_counts[row['person_id']] += int(row['pending'])
        missing = max(0, slot['required'] - len(records))
        output['slots'].append({**slot, 'assigned': records, 'shortage': missing,
                                'incomplete_group': slot['role'] == 'deep' and len(records) % 3 != 0})
        total_required += slot['required']
        total_assigned += len(records)
        shortage += missing
        pending += sum(x['pending'] for x in records)
    output['summary'] = {'required_assignments': total_required, 'assigned': total_assigned,
                         'distinct_people': len(counts), 'shortage': shortage, 'pending': pending}
    output['workload'] = [{'person_id': pid, 'name': p['name'], 'shifts': counts[pid],
                           'hours': counts[pid] * 2, 'pending': pending_counts[pid]}
                          for pid, p in people.items()]
    return output


def audit(data, output):
    prepared = prepare(data)
    people, slots, policy, excluded = prepared
    require(output.get('dates') == sorted(data['dates']) and output.get('timezone') == data['timezone'],
            'Target dates/timezone mismatch')
    rows = output['slots']
    require(len(rows) == len(slots) and {x['slot_id'] for x in rows} == set(slots), 'Missing/duplicate/unknown slot')
    assignments = {key: [] for key in slots}
    for row in rows:
        key = row['slot_id']
        require(all(row.get(k) == v for k, v in slots[key].items()), 'Slot metadata mismatch: ' + key)
        require(len(row['assigned']) <= slots[key]['required'], 'Over target: ' + key)
        for entry in row['assigned']:
            pid = entry['person_id']
            require(pid in people, 'Unknown person: ' + pid)
            require(candidate(people[pid], slots[key], policy, excluded) is not None, 'Ineligible: ' + pid + ' ' + key)
            require(fits(pid, key, assignments, people, slots), 'Overlap/duplicate/limit: ' + pid + ' ' + key)
            assignments[key].append(pid)
    for item in data.get('locked', []):
        require(item['person_id'] in assignments[item['slot_id']], 'Locked assignment lost')
    canonical = render(data, assignments, prepared)
    canonical_rows = {r['slot_id']: r for r in canonical['slots']}
    for row in rows:
        expected = canonical_rows[row['slot_id']]
        require(sorted(row['assigned'], key=lambda x: x['person_id']) == expected['assigned'],
                'Evidence/pending/group/name mismatch: ' + row['slot_id'])
        require(all(row.get(k) == expected[k] for k in ('shortage', 'incomplete_group')), 'Incorrect shortage/group flag')
    for key in ('summary', 'workload', 'policy'):
        require(output.get(key) == canonical[key], 'Incorrect ' + key)
    return canonical['summary']


def solve(data, trials=400, seed=0):
    require(type(trials) is int and trials > 0, 'trials must be positive')
    prepared = prepare(data)
    people, slots, policy, excluded = prepared
    candidates = {key: {pid: entry for pid, p in people.items()
                        if (entry := candidate(p, slot, policy, excluded)) is not None}
                  for key, slot in slots.items()}
    fixed = {key: [] for key in slots}
    for item in data.get('locked', []):
        pid, key = item['person_id'], item['slot_id']
        require(pid in candidates[key] and fits(pid, key, fixed, people, slots), 'Invalid locked assignment: ' + str(item))
        require(len(fixed[key]) < slots[key]['required'], 'Too many locked people')
        fixed[key].append(pid)
    rng, best, best_score = random.Random(seed), None, None
    for _ in range(trials):
        assignments = {k: v[:] for k, v in fixed.items()}
        loads = collections.Counter(pid for ids in assignments.values() for pid in ids)
        daily = collections.Counter((pid, slots[k]['date']) for k, ids in assignments.items() for pid in ids)
        evening = collections.Counter(pid for k, ids in assignments.items()
                                      if slots[k]['shift_id'] == 'tent_evening' for pid in ids)
        keys = sorted(slots, key=lambda k: (len(candidates[k]) - slots[k]['required'] + rng.random() * 3))
        for key in keys:
            slot = slots[key]
            while len(assignments[key]) < slot['required']:
                options = [pid for pid in candidates[key] if fits(pid, key, assignments, people, slots)]
                if not options:
                    break
                pid = min(options, key=lambda p: (int(candidates[key][p]['pending']),
                          loads[p] * 4 + daily[(p, slot['date'])] * 3
                          + (evening[p] if slot['shift_id'] == 'tent_evening' else 0) + rng.random() * 5))
                assignments[key].append(pid)
                loads[pid] += 1
                daily[(pid, slot['date'])] += 1
                evening[pid] += int(slot['shift_id'] == 'tent_evening')
        gap = sum(slots[k]['required'] - len(ids) for k, ids in assignments.items())
        tentative = sum(candidates[k][pid]['pending'] for k, ids in assignments.items() for pid in ids)
        fairness = sum(n*n for n in loads.values()) + sum(max(0, n-2)**2 for n in daily.values()) + sum(n*n for n in evening.values())
        score = (gap, tentative, fairness)
        if best_score is None or score < best_score:
            best_score, best = score, assignments
    result = render(data, best, prepared)
    audit(data, result)
    return result


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    generate = sub.add_parser('solve')
    generate.add_argument('input')
    generate.add_argument('output')
    generate.add_argument('--trials', type=int, default=400)
    generate.add_argument('--seed', type=int, default=0)
    check = sub.add_parser('validate')
    check.add_argument('input')
    check.add_argument('output')
    args = parser.parse_args()
    try:
        data = read(args.input)
        if args.command == 'solve':
            result = solve(data, args.trials, args.seed)
            Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            report = result['summary']
        else:
            report = audit(data, read(args.output))
        print(json.dumps({'validation': 'PASS', **report}, ensure_ascii=False))
    except (ValueError, KeyError, TypeError) as error:
        parser.exit(2, 'INVALID: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
