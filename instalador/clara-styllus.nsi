; Instalador do Clara Styllus PDV para Windows 10/11 (64 bits).
; Gerado por instalador/build.sh — não compile direto sem os arquivos de STAGING.
;
; O que ele faz:
;  - copia o sistema e um Node.js próprio para "Arquivos de Programas\Clara Styllus PDV";
;  - registra o serviço "Clara Styllus PDV", que inicia junto com o Windows;
;  - guarda os dados em C:\ProgramData\ClaraStyllus (não se perdem ao atualizar/desinstalar);
;  - cria atalhos na área de trabalho e no menu Iniciar (abre como aplicativo no Edge/Chrome).

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

!ifndef VERSAO
  !error "Defina -DVERSAO=x.y.z"
!endif
!ifndef STAGING
  !error "Defina -DSTAGING=pasta"
!endif
!ifndef SAIDA
  !define SAIDA "ClaraStyllus-PDV-Setup-${VERSAO}.exe"
!endif

!define APP "Clara Styllus PDV"
!define SERVICO "ClaraStyllusPDV"
!define URL "http://localhost:3456"
!define CHAVE_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaraStyllusPDV"

Name "${APP}"
OutFile "${SAIDA}"
InstallDir "$PROGRAMFILES64\${APP}"
InstallDirRegKey HKLM "${CHAVE_UNINST}" "InstallLocation"
RequestExecutionLevel admin
BrandingText "${APP} ${VERSAO}"

VIProductVersion "${VERSAO}.0"
VIAddVersionKey /LANG=1046 "ProductName" "${APP}"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do ${APP}"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "CompanyName" "Clara Styllus"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Clara Styllus"

!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "${STAGING}\icone.ico"
!define MUI_UNICON "${STAGING}\icone.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Instalação do ${APP}"
!define MUI_WELCOMEPAGE_TEXT "Este assistente vai instalar o ponto de venda da Clara Styllus neste computador.$\r$\n$\r$\nO sistema funciona sem internet. Se você já tem uma versão instalada, ela será atualizada e os dados (produtos, vendas, clientes) serão mantidos — antes disso é feita uma cópia de segurança.$\r$\n$\r$\nClique em Avançar para continuar."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${APP} agora"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Var Navegador
Var Dados

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "O ${APP} precisa do Windows 64 bits."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "O ${APP} precisa do Windows 10 ou 11."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

; Procura Edge ou Chrome para abrir o PDV em modo aplicativo (janela própria, sem barra de endereço).
Function AcharNavegador
  StrCpy $Navegador ""
  ReadRegStr $Navegador HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${If} $Navegador == ""
    ReadRegStr $Navegador HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${EndIf}
  ${If} $Navegador == ""
    ReadRegStr $Navegador HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${EndIf}
  ${If} $Navegador != ""
  ${AndIfNot} ${FileExists} "$Navegador"
    StrCpy $Navegador ""
  ${EndIf}
FunctionEnd

!macro CriarAtalho caminho
  ${If} $Navegador != ""
    CreateShortCut "${caminho}" "$Navegador" "--app=${URL} --start-maximized" "$INSTDIR\icone.ico" 0
  ${Else}
    ; Sem Edge/Chrome: abre no navegador padrão.
    CreateShortCut "${caminho}" "$WINDIR\explorer.exe" "${URL}" "$INSTDIR\icone.ico" 0
  ${EndIf}
!macroend

Function AbrirApp
  ; Pelo explorer, para o navegador não abrir com permissão de administrador.
  Exec '"$WINDIR\explorer.exe" "$SMPROGRAMS\${APP}\${APP}.lnk"'
FunctionEnd

!macro PararServico
  ${If} ${FileExists} "$INSTDIR\${SERVICO}.exe"
    DetailPrint "Parando o serviço..."
    nsExec::ExecToLog '"$INSTDIR\${SERVICO}.exe" stop'
    Pop $0
    nsExec::ExecToLog '"$INSTDIR\${SERVICO}.exe" uninstall'
    Pop $0
    Sleep 1500
  ${EndIf}
!macroend

Section "Instalar"
  SetShellVarContext all
  SetRegView 64
  StrCpy $Dados "$APPDATA\ClaraStyllus"

  !insertmacro PararServico

  ; Cópia de segurança do banco antes de atualizar.
  ${If} ${FileExists} "$Dados\dados\clara-styllus.db"
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    CreateDirectory "$Dados\backups"
    StrCpy $7 "$Dados\backups\antes-da-versao-${VERSAO}-$2$1$0-$4$5"
    DetailPrint "Fazendo backup dos dados em $7..."
    CopyFiles /SILENT "$Dados\dados\clara-styllus.db" "$7.db"
    ${If} ${FileExists} "$Dados\dados\clara-styllus.db-wal"
      CopyFiles /SILENT "$Dados\dados\clara-styllus.db-wal" "$7.db-wal"
    ${EndIf}
  ${EndIf}

  ; Remove a versão anterior do sistema (os dados ficam em ProgramData).
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"

  SetOutPath "$INSTDIR"
  File /r "${STAGING}\*"
  CreateDirectory "$Dados\dados"
  CreateDirectory "$Dados\logs"

  DetailPrint "Registrando o serviço do Windows..."
  nsExec::ExecToLog '"$INSTDIR\${SERVICO}.exe" install'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Não foi possível registrar o serviço (código $0). Veja os logs em $Dados\logs."
  ${EndIf}
  ; Celular na rede da loja (foto do produto): libera a porta do sistema no firewall do Windows.
  ; O servidor só atende a página da foto para quem não está neste computador.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Clara Styllus PDV"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Clara Styllus PDV" dir=in action=allow protocol=TCP localport=3456 profile=any'
  nsExec::ExecToLog '"$INSTDIR\${SERVICO}.exe" start'
  Pop $0

  ; Atualização automática: remove a tarefa agendada que chamou este instalador (se houver).
  nsExec::Exec 'schtasks /Delete /TN ClaraStyllusAtualizar /F'
  Pop $0
  CreateDirectory "$Dados\atualizacoes"

  ; Atalhos
  Call AcharNavegador
  CreateDirectory "$SMPROGRAMS\${APP}"
  !insertmacro CriarAtalho "$SMPROGRAMS\${APP}\${APP}.lnk"
  !insertmacro CriarAtalho "$DESKTOP\${APP}.lnk"
  ; Atalho do caixa em tela cheia (F11 sai da tela cheia).
  ${If} $Navegador != ""
    CreateShortCut "$SMPROGRAMS\${APP}\${APP} - Caixa (tela cheia).lnk" "$Navegador" "--app=${URL}/#/pdv --start-fullscreen" "$INSTDIR\icone.ico" 0
    CreateShortCut "$DESKTOP\${APP} - Caixa.lnk" "$Navegador" "--app=${URL}/#/pdv --start-fullscreen" "$INSTDIR\icone.ico" 0
  ${EndIf}
  CreateShortCut "$SMPROGRAMS\${APP}\Pasta de dados e backups.lnk" "$WINDIR\explorer.exe" '"$Dados"'
  ; Esqueci a senha: o sistema grava o código neste arquivo (só quem está no computador consegue ler).
  CreateShortCut "$SMPROGRAMS\${APP}\Código para redefinir a senha.lnk" "$WINDIR\notepad.exe" '"$Dados\REDEFINIR-SENHA.txt"'
  CreateShortCut "$SMPROGRAMS\${APP}\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"

  ; Painel "Aplicativos instalados"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "${CHAVE_UNINST}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${CHAVE_UNINST}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKLM "${CHAVE_UNINST}" "Publisher" "Clara Styllus"
  WriteRegStr HKLM "${CHAVE_UNINST}" "DisplayIcon" "$INSTDIR\icone.ico"
  WriteRegStr HKLM "${CHAVE_UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${CHAVE_UNINST}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr HKLM "${CHAVE_UNINST}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKLM "${CHAVE_UNINST}" "NoModify" 1
  WriteRegDWORD HKLM "${CHAVE_UNINST}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${CHAVE_UNINST}" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Clara Styllus PDV"'
  SetShellVarContext all
  SetRegView 64
  StrCpy $Dados "$APPDATA\ClaraStyllus"

  !insertmacro PararServico

  Delete "$DESKTOP\${APP}.lnk"
  Delete "$DESKTOP\${APP} - Caixa.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  ; Apaga só o que o instalador colocou (nunca a pasta inteira escolhida pelo usuário).
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\${SERVICO}.exe"
  Delete "$INSTDIR\${SERVICO}.xml"
  Delete "$INSTDIR\${SERVICO}.*.log"
  Delete "$INSTDIR\icone.ico"
  Delete "$INSTDIR\LICENCAS.txt"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${CHAVE_UNINST}"

  ; Por segurança os dados ficam, a não ser que a pessoa peça para apagar.
  IfSilent fim
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "Apagar também TODOS OS DADOS (produtos, vendas, clientes e backups)?$\r$\n$\r$\nEscolha Não se for reinstalar depois. Os dados ficam em:$\r$\n$Dados" \
    IDNO fim
  RMDir /r "$Dados"
  fim:
SectionEnd
