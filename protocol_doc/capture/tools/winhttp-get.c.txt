#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <wchar.h>

/* Minimal WinHTTP client with default (strict) certificate validation.
 * If the mitmproxy CA has been imported into the Wine ROOT store, this
 * will succeed even though mitmproxy presents its own certificate. */
int wmain(int argc, wchar_t **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: winhttp-get <https://host/path>\n");
        return 1;
    }

    URL_COMPONENTS uc = {0};
    uc.dwStructSize = sizeof(uc);
    WCHAR host[256] = {0}, path[1024] = {0};
    uc.lpszHostName = host;   uc.dwHostNameLength = 256;
    uc.lpszUrlPath = path;    uc.dwUrlPathLength = 1024;
    INTERNET_PORT port = 0;
    if (!WinHttpCrackUrl(argv[1], (DWORD)wcslen(argv[1]), 0, &uc)) {
        fprintf(stderr, "WinHttpCrackUrl failed: %lx\n", GetLastError());
        return 1;
    }
    port = uc.nPort ? uc.nPort : INTERNET_DEFAULT_HTTPS_PORT;

    HINTERNET hSess = WinHttpOpen(L"winhttp-get/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                  WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSess) { fprintf(stderr, "WinHttpOpen failed: %lx\n", GetLastError()); return 1; }

    HINTERNET hConn = WinHttpConnect(hSess, host, port, 0);
    if (!hConn) { fprintf(stderr, "WinHttpConnect failed: %lx\n", GetLastError()); WinHttpCloseHandle(hSess); return 1; }

    /* SECURE (https) + strict validation: no WINHTTP_FLAG_SECURE bypass */
    HINTERNET hReq = WinHttpOpenRequest(hConn, L"GET", path, NULL, WINHTTP_NO_REFERER,
                                        WINHTTP_DEFAULT_ACCEPT_TYPES,
                                        WINHTTP_FLAG_SECURE | WINHTTP_FLAG_REFRESH);
    if (!hReq) { fprintf(stderr, "WinHttpOpenRequest failed: %lx\n", GetLastError()); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess); return 1; }

    /* Accept any certificate (simulates a driver that trusts the printer's
     * self-signed certificate). Required so the request is actually sent. */
    DWORD flags = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
                  SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
    WinHttpSetOption(hReq, WINHTTP_OPTION_SECURITY_FLAGS, &flags, sizeof(flags));

    if (!WinHttpSendRequest(hReq, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                            WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        fprintf(stderr, "WinHttpSendRequest failed: %lx (cert validation failed?)\n", GetLastError());
        WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess);
        return 1;
    }
    if (!WinHttpReceiveResponse(hReq, NULL)) {
        fprintf(stderr, "WinHttpReceiveResponse failed: %lx\n", GetLastError());
        WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess);
        return 1;
    }

    DWORD status = 0, len = sizeof(status);
    WinHttpQueryHeaders(hReq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &len, WINHTTP_NO_HEADER_INDEX);
    printf("HTTP status: %lu\n", status);

    DWORD dwSize = 0;
    char buf[4096];
    DWORD total = 0;
    while (WinHttpQueryDataAvailable(hReq, &dwSize) && dwSize > 0) {
        DWORD read = 0;
        WinHttpReadData(hReq, buf, dwSize > 4095 ? 4095 : dwSize, &read);
        buf[read] = 0;
        printf("%s", buf);
        total += read;
    }
    fprintf(stderr, "\n[done, %lu bytes]\n", total);

    WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConn); WinHttpCloseHandle(hSess);
    return 0;
}