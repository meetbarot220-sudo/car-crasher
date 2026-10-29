import subprocess
import time
import json
import urllib.request
import websocket
import os
import base64
import http.server
import socketserver
import threading

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CDP_PORT = 9250
HTTP_PORT = 8089

def run():
    print(f"Starting local HTTP server on port {HTTP_PORT}...")
    Handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(('', HTTP_PORT), Handler)
    http_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    http_thread.start()

    user_dir = r"C:\Users\meet2\AppData\Local\Temp\chrome_driving_test"
    print(f"Launching Chrome on CDP port {CDP_PORT}...")
    chrome_proc = subprocess.Popen([
        CHROME_PATH,
        f"--remote-debugging-port={CDP_PORT}",
        "--headless=new",
        f"--user-data-dir={user_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        f"http://127.0.0.1:{HTTP_PORT}/index.html"
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    ws = None
    try:
        # Wait for debugging port
        tab = None
        for _ in range(30):
            time.sleep(0.3)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
                    tabs = json.loads(resp.read().decode())
                    for t in tabs:
                        if "8089" in t.get("url", ""):
                            tab = t
                            break
                    if tab:
                        break
                    if tabs:
                        tab = tabs[0]
            except Exception:
                pass

        if not tab:
            raise RuntimeError("Could not connect to Chrome debugging port")

        ws_url = tab["webSocketDebuggerUrl"]
        print(f"Connecting to WebSocket: {ws_url}")
        ws = websocket.create_connection(ws_url, timeout=10)

        msg_id = 0
        def send_cmd(method, params=None):
            nonlocal msg_id
            msg_id += 1
            payload = {"id": msg_id, "method": method}
            if params:
                payload["params"] = params
            ws.send(json.dumps(payload))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        send_cmd("Page.enable")
        send_cmd("Runtime.enable")

        # Wait until game is initialized
        for _ in range(20):
            time.sleep(0.2)
            res = send_cmd("Runtime.evaluate", {"expression": "Boolean(window.__game)"})
            if res.get("result", {}).get("value"):
                break
        else:
            raise RuntimeError("window.__game not initialized in time")

        print("Game initialized successfully!")

        # 1. Start playing immediately
        send_cmd("Runtime.evaluate", {
            "expression": "window.__game.startPlaying()"
        })

        time.sleep(0.5)

        # 2. Check initial state, traffic count, and chunk socket counts
        res = send_cmd("Runtime.evaluate", {
            "expression": """
            (() => {
                const g = window.__game;
                const w = g.getWorld();
                const p = g.getPlayer();
                const traffic = g.getTraffic();
                const police = g.getPolice();
                
                let minSockets = 99;
                let maxSockets = 0;
                let deadEndsCount = 0;
                let emptyCount = 0;
                let chunkCount = 0;

                for (let c of w.chunks.values()) {
                    chunkCount++;
                    if (c.socketCount < minSockets) minSockets = c.socketCount;
                    if (c.socketCount > maxSockets) maxSockets = c.socketCount;
                    if (c.socketCount === 1) deadEndsCount++;
                    if (c.socketCount === 0) emptyCount++;
                }

                let allTrafficHaveSegment = true;
                for (let t of traffic) {
                    if (!t.currentSegment) allTrafficHaveSegment = false;
                }

                return {
                    gameState: g.getGameState(),
                    trafficCount: traffic.length,
                    policeCount: police.length,
                    chunkCount: chunkCount,
                    minSockets: minSockets,
                    maxSockets: maxSockets,
                    deadEndsCount: deadEndsCount,
                    emptyCount: emptyCount,
                    allTrafficHaveSegment: allTrafficHaveSegment,
                    playerScore: g.getScore(),
                    playerSpeed: p.speed,
                    playerY: p.y
                };
            })()
            """,
            "returnByValue": True
        })
        init_stats = res.get("result", {}).get("value", {})
        print(f"Initial stats: {json.dumps(init_stats, indent=2)}")

        # Verify initial assertions
        assert init_stats["trafficCount"] >= 11, f"Expected >= 11 traffic cars, got {init_stats['trafficCount']}"
        assert init_stats["deadEndsCount"] == 0, f"Found {init_stats['deadEndsCount']} dead ends!"
        assert init_stats["emptyCount"] == 0, f"Found {init_stats['emptyCount']} empty chunks!"
        assert init_stats["minSockets"] >= 2, f"Found chunk with {init_stats['minSockets']} sockets (< 2)!"
        assert init_stats["allTrafficHaveSegment"], "Some traffic vehicles do not have a road segment!"

        # 3. Simulate driving forward along the road for 3 seconds (traversing multiple chunks)
        print("Driving forward along road for 3 seconds...")
        time.sleep(3.0)

        # Check stats after driving
        res_drive = send_cmd("Runtime.evaluate", {
            "expression": """
            (() => {
                const g = window.__game;
                const w = g.getWorld();
                const p = g.getPlayer();
                const traffic = g.getTraffic();
                
                let deadEndsCount = 0;
                let emptyCount = 0;
                let minSockets = 99;
                let chunkCount = 0;

                for (let c of w.chunks.values()) {
                    chunkCount++;
                    if (c.socketCount < minSockets) minSockets = c.socketCount;
                    if (c.socketCount === 1) deadEndsCount++;
                    if (c.socketCount === 0) emptyCount++;
                }

                let allTrafficHaveSegment = true;
                for (let t of traffic) {
                    if (!t.currentSegment) allTrafficHaveSegment = false;
                }

                return {
                    playerY: p.y,
                    playerSpeed: p.speed,
                    playerScore: g.getScore(),
                    trafficCount: traffic.length,
                    chunkCount: chunkCount,
                    minSockets: minSockets,
                    deadEndsCount: deadEndsCount,
                    emptyCount: emptyCount,
                    allTrafficHaveSegment: allTrafficHaveSegment
                };
            })()
            """,
            "returnByValue": True
        })
        drive_stats = res_drive.get("result", {}).get("value", {})
        print(f"After driving stats: {json.dumps(drive_stats, indent=2)}")

        assert drive_stats["playerY"] < -800, f"Player did not move forward enough: Y = {drive_stats['playerY']}"
        assert drive_stats["playerScore"] == 10000, f"Score changed unexpectedly: {drive_stats['playerScore']}"
        assert drive_stats["deadEndsCount"] == 0, f"Dead ends found after streaming: {drive_stats['deadEndsCount']}"
        assert drive_stats["emptyCount"] == 0, f"Empty chunks found after streaming: {drive_stats['emptyCount']}"
        assert drive_stats["minSockets"] >= 2, f"Chunk socketCount < 2: {drive_stats['minSockets']}"
        assert drive_stats["allTrafficHaveSegment"], "Some traffic lost their road segment!"

        # 4. Take high-res screenshot
        shot = send_cmd("Page.captureScreenshot", {"format": "png"})
        if "data" in shot:
            with open("continuous_road_traffic_verification.png", "wb") as f:
                f.write(base64.b64decode(shot["data"]))
            print("Screenshot successfully captured and saved to continuous_road_traffic_verification.png")

        print("=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        if ws:
            ws.close()
        chrome_proc.terminate()
        chrome_proc.wait(timeout=3)
        httpd.shutdown()

if __name__ == "__main__":
    run()
