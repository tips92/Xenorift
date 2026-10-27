@echo off
rem Variables d'environnement des outils de build, tout sur D: (C: est plein).
set "JAVA_HOME=D:\DevTools\jdk-21"
set "ANDROID_HOME=D:\DevTools\android-sdk"
set "ANDROID_SDK_ROOT=D:\DevTools\android-sdk"
set "ANDROID_USER_HOME=D:\DevTools\android-user"
set "GRADLE_USER_HOME=D:\DevTools\gradle-home"
set "npm_config_cache=D:\DevTools\npm-cache"
set "TEMP=D:\DevTools\tmp"
set "TMP=D:\DevTools\tmp"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"
