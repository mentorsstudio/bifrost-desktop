// ==WindhawkMod==
// @id              bifrost-notch
// @name            Bifrost — ilha sempre por cima (notch)
// @description     Mantém a ilha do Bifrost por cima de tudo, como o notch do MacBook, mesmo quando outro programa se força para o topo
// @version         0.1
// @author          Paulo (Bifrost)
// @include         explorer.exe
// @compilerOptions -luser32 -lshell32
// @license         MIT
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# Bifrost — ilha sempre por cima

O Bifrost já reserva a faixa do alto da tela (AppBar) e se reafirma "sempre por
cima" a cada ~750 ms. Este mod é **opcional**: só serve quando algum programa
insiste em ficar acima da ilha (outro app topmost, overlays). Roda dentro do
`explorer.exe` e, a cada troca de janela em primeiro plano, devolve a ilha do
Bifrost ao topo — sem roubar o foco.

A janela da ilha é achada pelo processo `bifrost-desktop.exe`, título `Bifrost`,
encostada no alto do monitor e com até 340 px de altura (o hub é maior e fica de fora).
*/
// ==/WindhawkModReadme==

// ==WindhawkModSettings==
/*
- yieldToFullscreen: true
  $name: Ceder à tela cheia
  $description: Não puxa a ilha para cima enquanto um jogo, vídeo ou apresentação ocupa a tela inteira
*/
// ==/WindhawkModSettings==

#include <windows.h>
#include <shellapi.h>
#include <psapi.h>

static HWINEVENTHOOK g_hook = nullptr;
static HANDLE g_thread = nullptr;
static DWORD g_threadId = 0;
static bool g_yield = true;

static bool IsBifrostIsland(HWND h) {
    if (!IsWindowVisible(h)) return false;
    wchar_t title[32];
    if (GetWindowTextW(h, title, 32) == 0 || lstrcmpW(title, L"Bifrost") != 0) return false;
    RECT r;
    if (!GetWindowRect(h, &r) || r.bottom - r.top > 340) return false;
    HMONITOR m = MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{sizeof(mi)};
    if (!GetMonitorInfoW(m, &mi) || r.top != mi.rcMonitor.top) return false;
    DWORD pid = 0;
    GetWindowThreadProcessId(h, &pid);
    HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!p) return false;
    wchar_t path[MAX_PATH];
    DWORD n = MAX_PATH;
    bool ok = QueryFullProcessImageNameW(p, 0, path, &n) && wcsstr(path, L"bifrost-desktop.exe");
    CloseHandle(p);
    return ok;
}

static BOOL CALLBACK Raise(HWND h, LPARAM) {
    if (IsBifrostIsland(h))
        SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
    return TRUE;
}

static bool FullscreenNow() {
    QUERY_USER_NOTIFICATION_STATE s;
    if (FAILED(SHQueryUserNotificationState(&s))) return false;
    return s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE;
}

static void CALLBACK OnForeground(HWINEVENTHOOK, DWORD, HWND, LONG, LONG, DWORD, DWORD) {
    if (g_yield && FullscreenNow()) return;
    EnumWindows(Raise, 0);
}

static DWORD WINAPI Pump(LPVOID) {
    g_hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, OnForeground, 0, 0,
                             WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) DispatchMessageW(&msg);
    if (g_hook) UnhookWinEvent(g_hook);
    return 0;
}

static void LoadSettings() { g_yield = Wh_GetIntSetting(L"yieldToFullscreen") != 0; }

BOOL Wh_ModInit() {
    LoadSettings();
    g_thread = CreateThread(nullptr, 0, Pump, nullptr, 0, &g_threadId);
    return g_thread != nullptr;
}

void Wh_ModUninit() {
    if (g_thread) {
        PostThreadMessageW(g_threadId, WM_QUIT, 0, 0);
        WaitForSingleObject(g_thread, 2000);
        CloseHandle(g_thread);
    }
}

void Wh_ModSettingsChanged() { LoadSettings(); }
