@echo off
REM Open Soupy Gear Studio in a real browser, bypassing any file association
REM that would otherwise show a static preview instead of running the editor.
setlocal
set "APP=%~dp0index.html"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%APP%"
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP%"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%APP%"
) else (
  echo Could not find Microsoft Edge or Google Chrome.
  echo Right-click index.html, choose Open with, and pick your browser.
  pause
)
endlocal
