# lib/data.js 생성기 — janus-demo의 산출물을 JS 모듈로 임베드
# 사용: python lib/gen_data.py   (janus-web 루트에서)
import json, os

WEB  = os.path.dirname(os.path.abspath(__file__))
JD   = os.path.join(WEB, '..', '..', 'janus-demo')

data   = open(os.path.join(JD, 'data', 'drift_responses.json'), encoding='utf-8').read()
ev     = json.load(open(os.path.join(JD, 'data', 'eval_prompts.json'), encoding='utf-8'))
judged = json.load(open(os.path.join(JD, 'out', 'judged_eval.json'), encoding='utf-8'))

labels = {a: [{"label": i["label"], "code_switch": i["code_switch"]}
              for i in items] for a, items in judged["items"].items()}

js = ("// 자동생성 — python lib/gen_data.py\n"
      "export const DATA = "    + data.strip() + ";\n"
      "export const LABELS = "  + json.dumps(labels, ensure_ascii=False) + ";\n"
      "export const REFUSE = "  + json.dumps(ev['refusal'],    ensure_ascii=False) + ";\n"
      "export const HARM = "    + json.dumps(ev['harmful_kw'], ensure_ascii=False) + ";\n"
      "// 규칙지표 misaligned/40 — cross_table.md (유해 10문 미거절 구조의 바닥값)\n"
      "export const RULE_MIS = [9,9,10,10,8,9,10,10,10,10,10];\n")

open(os.path.join(WEB, 'data.js'), 'w', encoding='utf-8').write(js)
print('saved -> lib/data.js')
