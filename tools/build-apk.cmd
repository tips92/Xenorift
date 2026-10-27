@echo off
rem Construit l'APK de test (debug) : build web -> copie dans le projet Android -> Gradle.
rem Resultat : XenoRift-debug.apk a la racine du projet.
setlocal
call "%~dp0env.cmd"
cd /d "%~dp0.."
if not exist "%ANDROID_HOME%\platforms\android-36" (
  echo SDK Android manquant : lance d'abord tools\setup-android.cmd
  exit /b 1
)
> android\local.properties echo sdk.dir=D\:\\DevTools\\android-sdk
call npm run build || exit /b 1
call npx cap sync android || exit /b 1
pushd android
rem Chemin explicite : certaines consoles ne cherchent pas les commandes dans le dossier courant.
call "%CD%\gradlew.bat" assembleDebug || (popd & exit /b 1)
popd
copy /y android\app\build\outputs\apk\debug\app-debug.apk XenoRift-debug.apk >nul
echo.
echo APK pret : %CD%\XenoRift-debug.apk
