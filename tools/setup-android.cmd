@echo off
rem Installe Java (JDK 21) et le SDK Android dans D:\DevTools, sans rien ecrire sur C:.
rem Relancable sans risque : chaque etape deja faite est sautee.
rem Accepte les licences du SDK Android de Google (accord donne par le proprietaire du projet).
setlocal
call "%~dp0env.cmd"
set "DL=D:\DevTools\downloads"
for %%d in ("%DL%" "%TEMP%" "%ANDROID_USER_HOME%" "%GRADLE_USER_HOME%") do if not exist %%d mkdir %%d

rem 1. JDK 21 (Microsoft Build of OpenJDK)
if exist "%JAVA_HOME%\bin\java.exe" goto :have_jdk
echo == Telechargement du JDK 21
curl.exe -L --fail -sS -o "%DL%\jdk21.zip" "https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip" || goto :fail
if exist "%DL%\jdk-extract" rmdir /s /q "%DL%\jdk-extract"
mkdir "%DL%\jdk-extract"
tar -xf "%DL%\jdk21.zip" -C "%DL%\jdk-extract" || goto :fail
for /d %%D in ("%DL%\jdk-extract\*") do move "%%D" "%JAVA_HOME%" >nul
:have_jdk
echo == JDK : %JAVA_HOME%

rem 2. Android command-line tools (sdkmanager)
set "SDKM=%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat"
if exist "%SDKM%" goto :have_sdkm
echo == Telechargement des Android command-line tools
curl.exe -L --fail -sS -o "%DL%\cmdline-tools.zip" "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" || goto :dns
if exist "%DL%\clt-extract" rmdir /s /q "%DL%\clt-extract"
mkdir "%DL%\clt-extract"
tar -xf "%DL%\cmdline-tools.zip" -C "%DL%\clt-extract" || goto :fail
if not exist "%ANDROID_HOME%\cmdline-tools" mkdir "%ANDROID_HOME%\cmdline-tools"
move "%DL%\clt-extract\cmdline-tools" "%ANDROID_HOME%\cmdline-tools\latest" >nul || goto :fail
:have_sdkm

rem 3. Licences + paquets du SDK (Capacitor 8 : compileSdk 36)
echo == Acceptation des licences du SDK Android
rem Reponses lues depuis un fichier : un tube "| sdkmanager" envoie "y " (espace en trop) et tout est refuse.
(for /l %%i in (1,1,40) do @echo y)> "%DL%\yes.txt"
call "%SDKM%" --licenses --sdk_root="%ANDROID_HOME%" < "%DL%\yes.txt" >nul
echo == Installation : platform-tools, android-36, build-tools 36
call "%SDKM%" --sdk_root="%ANDROID_HOME%" "platform-tools" "platforms;android-36" "build-tools;36.0.0" < "%DL%\yes.txt" || goto :fail
rem sdkmanager sort sans erreur meme quand il saute des paquets : on verifie.
if not exist "%ANDROID_HOME%\platforms\android-36\android.jar" goto :fail
if not exist "%ANDROID_HOME%\build-tools\36.0.0" goto :fail
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" goto :fail
echo == Installation terminee
exit /b 0

:dns
echo.
echo ERREUR : impossible de joindre dl.google.com (serveur de Google pour le SDK Android).
echo Ton DNS, ta box ou un bloqueur de pub (Pi-hole, AdGuard, NextDNS...) bloque probablement ce domaine.
echo Autorise dl.google.com puis relance ce script.
exit /b 1

:fail
echo ERREUR pendant l'installation.
exit /b 1
