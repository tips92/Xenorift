@echo off
rem Installe l'APK sur le telephone branche en USB (mode developpeur + debogage USB actives).
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0.."
adb devices
adb install -r XenoRift-debug.apk
