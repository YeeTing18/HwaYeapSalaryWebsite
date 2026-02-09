Set WinScriptHost = CreateObject("WScript.Shell")
WinScriptHost.Run Chr(34) & CreateObject("WScript.Shell").CurrentDirectory & "\start-server.bat" & Chr(34), 0
Set WinScriptHost = Nothing 