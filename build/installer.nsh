!macro customHeader
  ShowInstDetails show
  ShowUnInstDetails show
!macroend

!macro customCheckAppRunning
  ; Try a few rounds to handle slower process shutdown and child processes.
  StrCpy $R2 0
  _opencli_check_retry:
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    DetailPrint `Closing running "${PRODUCT_NAME}"...`
    !ifdef INSTALL_MODE_PER_ALL_USERS
      nsExec::ExecToLog `taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}"`
    !else
      nsExec::ExecToLog `"$SYSDIR\cmd.exe" /c taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
      ; Fallback: if filtering by USERNAME misses, try unfiltered for current privilege scope.
      nsExec::ExecToLog `taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}"`
    !endif
    Sleep 1200
    ; Verify the process is actually terminated
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      IntOp $R2 $R2 + 1
      ${if} $R2 < 3
        Sleep 1000
        Goto _opencli_check_retry
      ${endif}
      ; Still running after several attempts - ask user to close manually.
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} 无法自动关闭，请手动关闭它，然后单击重试以继续。" IDRETRY _opencli_check_retry IDCANCEL _opencli_check_cancel
      _opencli_check_cancel:
      Quit
    ${endif}
  ${endif}
!macroend
