; Instalador do "computador extra" da Clara Styllus: não tem banco de dados nem servidor.
; Só cria o atalho que procura o computador do caixa na rede da loja e abre o sistema dele
; numa janela própria (sem barra de endereço). Gerado por instalador/build.sh.
;
; Instala só para o usuário atual (não pede senha de administrador).

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

!ifndef VERSAO
  !error "Defina -DVERSAO=x.y.z"
!endif
!ifndef STAGING
  !error "Defina -DSTAGING=pasta"
!endif

!define APP "Clara Styllus PDV"
!define CHAVE_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaraStyllusPDVExtra"

Name "${APP} (computador extra)"
OutFile "${SAIDA}"
InstallDir "$LOCALAPPDATA\ClaraStyllusExtra"
RequestExecutionLevel user
BrandingText "${APP} ${VERSAO}"

VIProductVersion "${VERSAO}.0"
VIAddVersionKey /LANG=1046 "ProductName" "${APP} - computador extra"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do ${APP} para outro computador da loja"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "CompanyName" "Clara Styllus"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Clara Styllus"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!define MUI_ICON "${STAGING}\icone.ico"
!define MUI_UNICON "${STAGING}\icone.ico"
!define MUI_WELCOMEPAGE_TITLE "Clara Styllus no computador extra"
!define MUI_WELCOMEPAGE_TEXT "Este instalador é para um SEGUNDO computador da loja (por exemplo, para cadastrar produtos enquanto o outro fica no caixa).$\r$\n$\r$\nEle não guarda dados aqui: usa os mesmos produtos, vendas e clientes do computador do caixa, pela rede da loja.$\r$\n$\r$\nAntes, no computador do caixa: Configurações → Loja → marque 'Permitir que outros computadores da loja usem o sistema' e salve.$\r$\n$\r$\nClique em Instalar."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Clara Styllus agora"
!define MUI_FINISHPAGE_RUN_FUNCTION Abrir

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Var Navegador
Var Url

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

!define PERFIL_ARGS '--user-data-dir="$INSTDIR\navegador" --no-first-run --no-default-browser-check --disable-features=AutofillServerCommunication'

!macro CriarAtalho caminho
  ${If} $Navegador != ""
    CreateShortCut "${caminho}" "$Navegador" '${PERFIL_ARGS} --app="$Url" --start-maximized' "$INSTDIR\icone.ico" 0
  ${Else}
    CreateShortCut "${caminho}" "$INSTDIR\abrir.html" "" "$INSTDIR\icone.ico" 0
  ${EndIf}
!macroend

Function Abrir
  Exec '"$WINDIR\explorer.exe" "$DESKTOP\${APP}.lnk"'
FunctionEnd

Section "Instalar"
  SetOutPath "$INSTDIR"
  File "${STAGING}\extra\abrir.html"
  File "${STAGING}\icone.ico"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  ; Perfil próprio do navegador: sem sugestões de preenchimento e sem salvar senhas.
  CreateDirectory "$INSTDIR\navegador\Default"
  ${IfNot} ${FileExists} "$INSTDIR\navegador\Default\Preferences"
    FileOpen $0 "$INSTDIR\navegador\Default\Preferences" w
    FileWrite $0 '{"autofill":{"enabled":false,"profile_enabled":false,"credit_card_enabled":false},'
    FileWrite $0 '"credentials_enable_service":false,"credentials_enable_autosignin":false,'
    FileWrite $0 '"profile":{"password_manager_enabled":false},"translate":{"enabled":false},'
    FileWrite $0 '"browser":{"check_default_browser":false},"search":{"suggest_enabled":false}}'
    FileClose $0
  ${EndIf}

  ; file:///C:/Users/.../abrir.html (barras normais e espaço codificado)
  ${WordReplace} "$INSTDIR\abrir.html" "\" "/" "+" $Url
  ${WordReplace} "$Url" " " "%20" "+" $Url
  StrCpy $Url "file:///$Url"

  Call AcharNavegador
  !insertmacro CriarAtalho "$DESKTOP\${APP}.lnk"
  CreateDirectory "$SMPROGRAMS\${APP}"
  !insertmacro CriarAtalho "$SMPROGRAMS\${APP}\${APP}.lnk"
  CreateShortCut "$SMPROGRAMS\${APP}\Desinstalar (computador extra).lnk" "$INSTDIR\Desinstalar.exe"

  WriteRegStr HKCU "${CHAVE_UNINST}" "DisplayName" "${APP} (computador extra)"
  WriteRegStr HKCU "${CHAVE_UNINST}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${CHAVE_UNINST}" "Publisher" "Clara Styllus"
  WriteRegStr HKCU "${CHAVE_UNINST}" "DisplayIcon" "$INSTDIR\icone.ico"
  WriteRegStr HKCU "${CHAVE_UNINST}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${CHAVE_UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE_UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\Desinstalar (computador extra).lnk"
  RMDir "$SMPROGRAMS\${APP}"
  RMDir /r "$INSTDIR\navegador"
  Delete "$INSTDIR\abrir.html"
  Delete "$INSTDIR\icone.ico"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${CHAVE_UNINST}"
SectionEnd
