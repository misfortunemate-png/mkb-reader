REM ---- mkb-reader server append block (Phase 6) ----
REM Add these lines to start-all.bat v4 in the appropriate section
REM Apply: copy the block below into start-all.bat

REM Start mkb-reader library server
cd /d "D:\AI\github\mkb-reader\server"
start "mkb-server" cmd /k "node index.js"
cd /d "D:\AI"

REM Add tailscale serve for mkb-reader (https 8443 -> 8788)
REM Note: do NOT overwrite existing serve config
REM Run once to register:  tailscale serve --bg --https=8443 http://127.0.0.1:8788
