Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir

If Not fso.FolderExists(dir & "\node_modules") Then
    MsgBox "node_modules not found. Please run install.bat first.", vbExclamation, "Event to ICS"
    WScript.Quit 1
End If

' Start the Next.js dev server in a hidden window
WshShell.Run "cmd /c node_modules\.bin\next dev -p 3000", 0, False

' Wait for server to be ready (port 3000 listening), up to 30 seconds
ready = False
For i = 1 To 60
    WScript.Sleep 500
    If PortListening() Then
        ready = True
        Exit For
    End If
Next

If Not ready Then
    MsgBox "Server failed to start within 30 seconds.", vbCritical, "Event to ICS"
    KillServer
    WScript.Quit 1
End If

' Open default browser
WshShell.Run "http://localhost:3000"

' Monitor: when no ESTABLISHED connections on port 3000 for 15 seconds, stop server
noConnCount = 0
Do
    WScript.Sleep 2000
    If HasEstablished() Then
        noConnCount = 0
    Else
        noConnCount = noConnCount + 1
        If noConnCount >= 8 Then
            Exit Do
        End If
    End If
Loop

KillServer

' --- Helpers ---

Function PortListening()
    tmp = WshShell.ExpandEnvironmentStrings("%TEMP%") & "\ics_listen.txt"
    WshShell.Run "cmd /c ""netstat -an | findstr :3000 | findstr LISTENING > """ & tmp & """""", 0, True
    On Error Resume Next
    Set f = fso.OpenTextFile(tmp, 1)
    If Err.Number <> 0 Then PortListening = False : Exit Function
    c = f.ReadAll : f.Close
    PortListening = Len(Trim(c)) > 0
End Function

Function HasEstablished()
    tmp = WshShell.ExpandEnvironmentStrings("%TEMP%") & "\ics_estab.txt"
    WshShell.Run "cmd /c ""netstat -an | findstr :3000 | findstr ESTABLISHED > """ & tmp & """""", 0, True
    On Error Resume Next
    Set f = fso.OpenTextFile(tmp, 1)
    If Err.Number <> 0 Then HasEstablished = False : Exit Function
    c = f.ReadAll : f.Close
    HasEstablished = Len(Trim(c)) > 0
End Function

Sub KillServer()
    ' Kill only the node process listening on port 3000
    WshShell.Run "cmd /c ""for /f """"tokens=5"""" %a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %a""", 0, True
End Sub