"""Synthetic browser-test fixture server; run from a disposable checkout.

Run without .env files or production credentials. Start this script in an isolated
clone with the existing dependencies available, then run
`python3 tools/test-web-spoiler-first-paint.py` in a second terminal.
Uses only fictional local DB data, rejects all writes, and never invokes LLMs.
"""
import json, os, subprocess, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
competition={"id":"11111111-1111-4111-8111-111111111111","slug":"urc-2026-27","name":"United Rugby Championship","name_ja":"ユナイテッド・ラグビー・チャンピオンシップ","family":"urc","season":"2026-27","start_date":"2026-09-25","end_date":"2027-06-19","total_rounds":18,"country":None,"matches":[{"count":3}],"competition_standings":[]}
def team(slug,name,code,id):
 return {"id":id,"slug":slug,"name":name,"name_ja":None,"short_code":code,"kind":"club","flag_code":None,"english_name":name,"world_ranking":None}
teams=[team("leinster","レンスター","LEI","21111111-1111-4111-8111-111111111111"),team("munster","マンスター","MUN","31111111-1111-4111-8111-111111111111"),team("glasgow-warriors","グラスゴー・ウォリアーズ","GLA","41111111-1111-4111-8111-111111111111"),team("edinburgh","エディンバラ","EDI","51111111-1111-4111-8111-111111111111")]
def match(index,home,away,kickoff,tbd):
 return {"id":f"00000000-0000-4000-8000-00000000000{index}","competition_id":competition["id"],"competition":competition,"home_team":home,"away_team":away,"home_team_id":home["id"],"away_team_id":away["id"],"kickoff_at":kickoff,"kickoff_time_tbd":tbd,"status":"scheduled","venue":"Aviva Stadium, Dublin" if index==1 else "Scotstoun Stadium, Glasgow","home_score":None,"away_score":None,"external_ids":{"wikipedia_round":3,"wikipedia_event_id":f"preview-{index}"},"broadcast_jp_url":None,"updated_at":"2026-10-06T00:00:00Z"}
matches=[match(1,teams[0],teams[1],"2026-10-05T16:30:00.000Z",False),match(2,teams[2],teams[3],"2026-10-10T16:30:00.000Z",False),match(3,teams[1],teams[2],"2026-10-04T16:30:00.000Z",False)]
matches[0].update({"id":"dcd576dd-f778-4690-b4e1-3d960bd664f1","status":"finished","home_score":31,"away_score":19})
matches[2].update({"status":"finished","home_score":24,"away_score":21})
contents=[{"match_id":matches[0]["id"],"content_type":kind,"content_md":md,"language":"ja","status":"published","generated_at":"2026-10-06T00:00:00Z","model_version":"local-fixture","prompt_version":"local-fixture","match":matches[0]} for kind,md in [("recap","# レンスターが接点で上回る\n\n31–19でレンスターが勝利した、画面確認用の架空レビューです。\n\n## 試合の核心\n\n前半の接点で流れをつかみました。"),("preview","# 試合前の見どころ\n\n試合前プレビューの確認用本文です。\n\n## 注目ポイント\n\n両チームの接点とキックに注目します。")]]
events=[{"id":f"local-event-{i}","match_id":matches[0]["id"],"minute":minute,"type":kind,"team_id":teams[side]["id"],"metadata":{"player_name":"確認用選手"}} for i,(minute,kind,side) in enumerate([(4,"try",0),(5,"conversion",0),(15,"try",1),(16,"conversion",1),(20,"penalty",0),(25,"try",0),(26,"conversion",0),(37,"try",1),(38,"conversion",1),(50,"try",0),(51,"conversion",0),(60,"try",1),(75,"try",0),(76,"conversion",0)])]

class PreviewDatabase(BaseHTTPRequestHandler):
 def do_GET(self):
  parsed=urlparse(self.path);q=parse_qs(parsed.query);table=parsed.path.rsplit("/",1)[-1]
  rows=matches.copy() if table=="matches" else [competition.copy()] if table=="competitions" else teams.copy() if table=="teams" else contents.copy() if table=="match_content" else events.copy() if table=="match_events" else []
  for key,values in q.items():
   if key in ("select","order","limit","offset","or"):continue
   for value in values:
    if value.startswith("eq."):rows=[row for row in rows if str(row.get(key))==value[3:]]
    elif value.startswith("neq."):rows=[row for row in rows if str(row.get(key))!=value[4:]]
    elif key=="kickoff_at" and value.startswith("gte."):rows=[row for row in rows if row["kickoff_at"]>=value[4:]]
    elif key=="kickoff_at" and value.startswith("lt."):rows=[row for row in rows if row["kickoff_at"]<value[3:]]
  limit=q.get("limit");rows=rows[:int(limit[0])] if limit else rows
  single="vnd.pgrst.object" in self.headers.get("Accept","")
  payload=rows[0] if single and rows else None if single else rows
  self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Range",f"0-{max(0,len(rows)-1)}/{len(rows)}");self.end_headers();self.wfile.write(json.dumps(payload).encode())
 def do_HEAD(self):
  self.send_response(200);self.send_header("Content-Range","*/0");self.end_headers()
 def do_POST(self):self.send_error(405)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(("127.0.0.1",0),PreviewDatabase);threading.Thread(target=server.serve_forever,daemon=True).start()
env={key:os.environ[key] for key in ["PATH","TMPDIR","LANG"] if key in os.environ}
env.update({"NEXT_TELEMETRY_DISABLED":"1","WATCHPACK_POLLING":"true","NEXT_PUBLIC_SUPABASE_URL":f"http://127.0.0.1:{server.server_port}","NEXT_PUBLIC_SUPABASE_ANON_KEY":"preview-placeholder","SUPABASE_SERVICE_ROLE_KEY":"preview-placeholder","OPENAI_API_KEY":"preview-placeholder","CRON_SECRET":"preview-placeholder","SCRAPER_USER_AGENT":"TrylineLocalPreview/1.0","VAPID_PRIVATE_KEY":"preview-placeholder","VAPID_PUBLIC_KEY":"preview-placeholder","VAPID_SUBJECT":"mailto:preview@example.invalid","WIKIPEDIA_SQUAD_URL":"https://en.wikipedia.org/wiki/2027_Six_Nations_Championship"})
print("Local preview with synthetic URC fixtures at http://127.0.0.1:3108",flush=True)
with open("/tmp/tryline-web-spoiler-preview.log","w") as log:
 result=subprocess.run(["pnpm","dev","--port","3108","--hostname","0.0.0.0"],env=env,stdout=log,stderr=subprocess.STDOUT)
server.shutdown();raise SystemExit(result.returncode)
