# Variables d'environnement des outils de build, tout sur D: (C: est plein).
# Usage dans un terminal PowerShell :  . .\tools\env.ps1
$env:JAVA_HOME = 'D:\DevTools\jdk-21'
$env:ANDROID_HOME = 'D:\DevTools\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = 'D:\DevTools\android-user'
$env:GRADLE_USER_HOME = 'D:\DevTools\gradle-home'
$env:npm_config_cache = 'D:\DevTools\npm-cache'
$env:TEMP = 'D:\DevTools\tmp'
$env:TMP = $env:TEMP
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
