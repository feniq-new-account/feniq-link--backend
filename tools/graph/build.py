"""Builds the code knowledge graph (graphify, AST only - no LLM, no API key).

Scope: backend/src, phoenix/lib (minus generated l10n) and web/src. Output in
graphify-out/: graph.json (queryable with `graphify query "..."`) and
GRAPH_REPORT.md. Communities are named after the feature folder most of their
nodes come from. Run from the repo root:  python3 tools/graph/build.py
"""
import json
import re
from collections import Counter
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect
from graphify.export import to_json
from graphify.extract import extract
from graphify.report import generate

ROOTS = ('/backend/src/', '/phoenix/lib/', '/web/src/')
OUT = Path('graphify-out')


def area(source_file):
    s = source_file or ''
    m = re.search(r'phoenix/lib/features/([^/]+)', s)
    if m:
        return f'app: {m.group(1)}'
    m = re.search(r'phoenix/lib/([^/]+)', s)
    if m:
        return f'app: {m.group(1)}'
    m = re.search(r'backend/src/(\w+)/([a-zA-Z]+)', s)
    if m:
        return f'api: {m.group(2)} ({m.group(1)})'
    m = re.search(r'web/src/(\w+)/([A-Za-z]+)', s)
    if m:
        return f'web: {m.group(2)}'
    return 'shared'


def main():
    OUT.mkdir(exist_ok=True)
    detected = detect(Path('.'))
    code = [f for f in detected['files'].get('code', [])
            if any(r in f for r in ROOTS) and '/generated/' not in f]
    detected['files'] = {'code': code}
    detected['total_files'] = len(code)

    extraction = extract([Path(f) for f in code], cache_root=Path('.'))
    graph = build_from_json(extraction, root='.', directed=True)
    communities = cluster(graph)
    cohesion = score_all(graph, communities)

    labels = {}
    for cid, nodes in communities.items():
        areas = Counter(area(graph.nodes[n].get('source_file')) for n in nodes if n in graph.nodes)
        top = areas.most_common(2)
        labels[cid] = ' + '.join(a for a, _ in top) if top else f'Community {cid}'

    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)
    # force: files get deleted, and a smaller graph is then the right answer.
    to_json(graph, communities, str(OUT / 'graph.json'), community_labels=labels, force=True)
    report = generate(graph, communities, cohesion, labels, gods, surprises, detected,
                      {'input': 0, 'output': 0}, '.', suggested_questions=questions)
    (OUT / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
    print(f'graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges, '
          f'{len(communities)} communities, {len(code)} files')


if __name__ == '__main__':
    main()
