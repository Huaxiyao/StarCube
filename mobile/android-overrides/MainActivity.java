package com.starcube.timer;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String PREFS_NAME = "starcube_ui_prefs";
    private static final String KEY_THEME_BG = "theme_bg";
    private static final String KEY_THEME_DARK = "theme_dark";
    private static final String KEY_KEEP_SCREEN_ON = "keep_screen_on";
    private static final String RELEASES_API_URL = "https://api.github.com/repos/Huaxiyao/StarCube/releases/latest";
    private static final String RELEASES_PAGE_URL = "https://github.com/Huaxiyao/StarCube/releases";
    private static final long MIN_SPLASH_MS = 340L;
    private static final long MAX_SPLASH_MS = 1800L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean bridgeAttached = false;
    private boolean splashDismissed = false;
    private long splashShownAtMs = 0L;
    private String pendingExportRequestId = null;
    private String pendingExportContent = null;
    private volatile boolean isDownloadingUpdate = false;
    private File pendingInstallApk = null;
    private ViewGroup rootContentView = null;
    private FrameLayout splashOverlay = null;
    private LinearLayout splashBrandBox = null;

    private final ActivityResultLauncher<Intent> unknownSourcesLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            File apk = pendingInstallApk;
            if (apk == null || !apk.exists()) {
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                pendingInstallApk = null;
                launchApkInstaller(apk);
            }
        });

    private final ActivityResultLauncher<Intent> exportDocumentLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            final String requestId = pendingExportRequestId;
            final String content = pendingExportContent;
            pendingExportRequestId = null;
            pendingExportContent = null;

            if (requestId == null) {
                return;
            }

            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
                notifyExportResult(requestId, "cancelled", "");
                return;
            }

            final Uri targetUri = result.getData().getData();
            final String payload = content != null ? content : "";

            new Thread(() -> {
                try {
                    OutputStream out = null;
                    try {
                        out = getContentResolver().openOutputStream(targetUri, "wt");
                    } catch (Exception ignored) {
                        out = getContentResolver().openOutputStream(targetUri);
                    }
                    if (out == null) {
                        notifyExportResult(requestId, "error", "无法打开目标文件进行写入");
                        return;
                    }
                    try (OutputStream stream = out) {
                        stream.write(payload.getBytes(StandardCharsets.UTF_8));
                        stream.flush();
                    }
                    notifyExportResult(requestId, "saved", "");
                } catch (Exception err) {
                    String msg = err.getMessage();
                    notifyExportResult(requestId, "error", msg != null && !msg.isEmpty() ? msg : "文件写入失败");
                }
            }).start();
        });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedBg = prefs.getString(KEY_THEME_BG, "#f3f4f6");
        boolean savedDark = prefs.getBoolean(KEY_THEME_DARK, false);
        boolean keepScreenOn = prefs.getBoolean(KEY_KEEP_SCREEN_ON, true);

        // 魔方练习期间按用户偏好保持屏幕常亮
        if (keepScreenOn) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        rootContentView = findViewById(android.R.id.content);
        if (rootContentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootContentView, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(rootContentView);
        }

        applySystemTheme(savedBg, savedDark, false);
        attachNativeBridgeIfNeeded();
        installSplashOverlay(savedBg, savedDark);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "if (window.__starCubeOnBackPressed) { window.__starCubeOnBackPressed(); }",
                    null
                );
            }
        });
    }

    @Override
    protected void load() {
        super.load();
        attachNativeBridgeIfNeeded();
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            getResources().getDisplayMetrics()
        ));
    }

    private int parseColorSafe(String colorHex, boolean isDark) {
        try {
            return Color.parseColor(colorHex);
        } catch (Exception err) {
            return isDark ? Color.parseColor("#0c0f14") : Color.parseColor("#f3f4f6");
        }
    }

    private void installSplashOverlay(String bgHex, boolean isDark) {
        if (rootContentView == null) {
            return;
        }
        int bgColor = parseColorSafe(bgHex, isDark);
        int titleColor = isDark ? Color.parseColor("#f3f6fb") : Color.parseColor("#111827");
        int subColor = isDark ? Color.parseColor("#9aa4b4") : Color.parseColor("#64748b");

        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(bgColor);
        overlay.setClickable(true);
        overlay.setFocusable(true);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_splash_mark);
        LinearLayout.LayoutParams markLp = new LinearLayout.LayoutParams(dp(76), dp(76));
        box.addView(mark, markLp);

        TextView title = new TextView(this);
        title.setText("StarCube");
        title.setTextColor(titleColor);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setLetterSpacing(0.03f);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleLp.topMargin = dp(16);
        box.addView(title, titleLp);

        TextView subtitle = new TextView(this);
        subtitle.setText("三阶魔方离线计时");
        subtitle.setTextColor(subColor);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subLp.topMargin = dp(6);
        box.addView(subtitle, subLp);

        FrameLayout.LayoutParams boxLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        overlay.addView(box, boxLp);

        FrameLayout.LayoutParams overlayLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        rootContentView.addView(overlay, overlayLp);

        box.setAlpha(0f);
        box.setScaleX(0.90f);
        box.setScaleY(0.90f);
        box.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(280L)
            .setInterpolator(new DecelerateInterpolator())
            .start();

        splashOverlay = overlay;
        splashBrandBox = box;
        splashShownAtMs = SystemClock.elapsedRealtime();

        // 安全兜底：即使 WebView 首帧回调异常，也确保过场动画自动退场
        mainHandler.postDelayed(this::dismissSplashOverlay, MAX_SPLASH_MS);
    }

    private void dismissSplashOverlay() {
        if (splashDismissed) {
            return;
        }
        splashDismissed = true;
        final FrameLayout overlay = splashOverlay;
        final LinearLayout box = splashBrandBox;
        if (overlay == null) {
            return;
        }

        long elapsed = SystemClock.elapsedRealtime() - splashShownAtMs;
        long delay = Math.max(0L, MIN_SPLASH_MS - elapsed);

        mainHandler.postDelayed(() -> {
            if (box != null) {
                box.animate()
                    .scaleX(1.06f)
                    .scaleY(1.06f)
                    .alpha(0f)
                    .setDuration(220L)
                    .setInterpolator(new AccelerateDecelerateInterpolator())
                    .start();
            }
            overlay.animate()
                .alpha(0f)
                .setDuration(260L)
                .setInterpolator(new AccelerateDecelerateInterpolator())
                .withEndAction(() -> {
                    if (overlay.getParent() instanceof ViewGroup) {
                        ((ViewGroup) overlay.getParent()).removeView(overlay);
                    }
                    splashOverlay = null;
                    splashBrandBox = null;
                })
                .start();
        }, delay);
    }

    private void attachNativeBridgeIfNeeded() {
        if (bridgeAttached || getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.addJavascriptInterface(new StarCubeAndroidBridge(), "StarCubeAndroid");
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        int bg = parseColorSafe(prefs.getString(KEY_THEME_BG, "#f3f4f6"), prefs.getBoolean(KEY_THEME_DARK, false));
        webView.setBackgroundColor(bg);
        bridgeAttached = true;
    }

    @SuppressWarnings("deprecation")
    private void applySystemTheme(String colorHex, boolean isDark, boolean persist) {
        int parsedColor = parseColorSafe(colorHex, isDark);

        if (persist) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(KEY_THEME_BG, colorHex)
                .putBoolean(KEY_THEME_DARK, isDark)
                .apply();
        }

        Window window = getWindow();
        if (window != null) {
            window.getDecorView().setBackgroundColor(parsedColor);
            if (Build.VERSION.SDK_INT < 35) {
                window.setStatusBarColor(parsedColor);
                window.setNavigationBarColor(parsedColor);
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(!isDark);
                controller.setAppearanceLightNavigationBars(!isDark);
            }
        }
        if (rootContentView != null) {
            rootContentView.setBackgroundColor(parsedColor);
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(parsedColor);
        }
    }

    private void notifyExportResult(String requestId, String status, String message) {
        runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) {
                return;
            }
            String js = "if (window.__starCubeOnExportResult) { window.__starCubeOnExportResult("
                + JSONObject.quote(requestId) + ", "
                + JSONObject.quote(status) + ", "
                + JSONObject.quote(message != null ? message : "")
                + "); }";
            webView.evaluateJavascript(js, null);
        });
    }

    private void notifyUpdateResult(String requestId, JSONObject payload) {
        runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) {
                return;
            }
            String js = "if (window.__starCubeOnUpdateResult) { window.__starCubeOnUpdateResult("
                + JSONObject.quote(requestId) + ", "
                + JSONObject.quote(payload.toString())
                + "); }";
            webView.evaluateJavascript(js, null);
        });
    }

    private String readAppVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (info != null && info.versionName != null && !info.versionName.isEmpty()) {
                return info.versionName;
            }
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        return "1.0.0";
    }

    private boolean isAllowedExternalUrl(String url) {
        if (url == null) {
            return false;
        }
        return url.startsWith("https://github.com/Huaxiyao/StarCube")
            || url.startsWith("https://objects.githubusercontent.com/")
            || url.startsWith("https://release-assets.githubusercontent.com/")
            || url.startsWith("https://github-releases.githubusercontent.com/");
    }

    private void notifyDownloadProgress(String requestId, long loaded, long total, int percent) {
        runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) {
                return;
            }
            String js = "if (window.__starCubeOnUpdateProgress) { window.__starCubeOnUpdateProgress("
                + JSONObject.quote(requestId) + ", "
                + loaded + ", "
                + total + ", "
                + percent
                + "); }";
            webView.evaluateJavascript(js, null);
        });
    }

    private void notifyDownloadResult(String requestId, String status, String message) {
        runOnUiThread(() -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) {
                return;
            }
            String js = "if (window.__starCubeOnDownloadResult) { window.__starCubeOnDownloadResult("
                + JSONObject.quote(requestId) + ", "
                + JSONObject.quote(status) + ", "
                + JSONObject.quote(message != null ? message : "")
                + "); }";
            webView.evaluateJavascript(js, null);
        });
    }

    private void launchApkInstaller(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception err) {
            Toast.makeText(this, "无法拉起系统安装界面，请改用浏览器下载", Toast.LENGTH_LONG).show();
        }
    }

    private void installOrRequestPermission(String requestId, File apkFile) {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                pendingInstallApk = apkFile;
                notifyDownloadResult(requestId, "need_permission", "安装包已就绪，请先允许 StarCube 安装应用，返回后将自动继续");
                try {
                    Intent permIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())
                    );
                    unknownSourcesLauncher.launch(permIntent);
                } catch (Exception err) {
                    notifyDownloadResult(requestId, "error", "无法打开系统安装权限设置页");
                }
                return;
            }
            notifyDownloadResult(requestId, "installing", "");
            launchApkInstaller(apkFile);
        });
    }

    private HttpURLConnection openAllowedDownloadConnection(String startUrl) throws Exception {
        String currentUrl = startUrl;
        for (int hops = 0; hops < 6; hops++) {
            if (!isAllowedExternalUrl(currentUrl)) {
                throw new SecurityException("不支持的下载地址");
            }
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("User-Agent", "StarCube-Android/" + readAppVersionName());
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                || code == HttpURLConnection.HTTP_MOVED_TEMP
                || code == HttpURLConnection.HTTP_SEE_OTHER
                || code == 307
                || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new Exception("下载重定向缺少目标地址");
                }
                currentUrl = new URL(new URL(currentUrl), location).toString();
                continue;
            }
            return conn;
        }
        throw new Exception("下载重定向次数过多");
    }

    private final class StarCubeAndroidBridge {
        @JavascriptInterface
        public void downloadAndInstallUpdate(final String requestId, final String url, final String filename) {
            if (!isAllowedExternalUrl(url)) {
                notifyDownloadResult(requestId, "error", "仅支持从 StarCube 官方 GitHub Releases 下载安装包");
                return;
            }
            if (isDownloadingUpdate) {
                notifyDownloadResult(requestId, "error", "正在下载更新包，请稍候");
                return;
            }
            isDownloadingUpdate = true;

            new Thread(() -> {
                HttpURLConnection conn = null;
                File partFile = null;
                try {
                    File updatesDir = new File(getCacheDir(), "updates");
                    if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                        throw new Exception("无法创建更新缓存目录");
                    }
                    String safeName = (filename != null ? filename.replaceAll("[^a-zA-Z0-9._-]", "_") : "");
                    if (safeName.isEmpty() || !safeName.endsWith(".apk")) {
                        safeName = "StarCube-update.apk";
                    }
                    File targetFile = new File(updatesDir, safeName);
                    partFile = new File(updatesDir, safeName + ".part");
                    if (partFile.exists()) {
                        partFile.delete();
                    }

                    conn = openAllowedDownloadConnection(url);
                    int code = conn.getResponseCode();
                    if (code != HttpURLConnection.HTTP_OK) {
                        throw new Exception("下载失败（HTTP " + code + "）");
                    }

                    long total = conn.getContentLengthLong();
                    long downloaded = 0L;
                    long lastEmitMs = 0L;
                    byte[] buffer = new byte[16384];

                    try (InputStream in = conn.getInputStream();
                         FileOutputStream out = new FileOutputStream(partFile)) {
                        int read;
                        while ((read = in.read(buffer)) != -1) {
                            out.write(buffer, 0, read);
                            downloaded += read;
                            long now = SystemClock.elapsedRealtime();
                            if (now - lastEmitMs >= 120L) {
                                int pct = total > 0 ? (int) Math.min(99L, (downloaded * 100L) / total) : -1;
                                notifyDownloadProgress(requestId, downloaded, total, pct);
                                lastEmitMs = now;
                            }
                        }
                        out.flush();
                    }

                    if (targetFile.exists()) {
                        targetFile.delete();
                    }
                    if (!partFile.renameTo(targetFile)) {
                        throw new Exception("保存安装包文件失败");
                    }
                    partFile = null;

                    notifyDownloadProgress(requestId, downloaded, total > 0 ? total : downloaded, 100);
                    installOrRequestPermission(requestId, targetFile);
                } catch (UnknownHostException | ConnectException err) {
                    notifyDownloadResult(requestId, "offline", "网络已断开，下载失败，请检查网络后重试");
                } catch (SocketTimeoutException err) {
                    notifyDownloadResult(requestId, "error", "下载超时，可重试或改用浏览器下载");
                } catch (Exception err) {
                    String msg = err.getMessage();
                    notifyDownloadResult(requestId, "error", msg != null && !msg.isEmpty() ? msg : "下载失败，请稍后重试");
                } finally {
                    if (partFile != null && partFile.exists()) {
                        partFile.delete();
                    }
                    if (conn != null) {
                        conn.disconnect();
                    }
                    isDownloadingUpdate = false;
                }
            }).start();
        }

        @JavascriptInterface
        public String getAppVersion() {
            return readAppVersionName();
        }

        @JavascriptInterface
        public void checkUpdate(final String requestId) {
            new Thread(() -> {
                JSONObject result = new JSONObject();
                HttpURLConnection conn = null;
                try {
                    result.put("htmlUrl", RELEASES_PAGE_URL);
                    conn = (HttpURLConnection) new URL(RELEASES_API_URL).openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("Accept", "application/vnd.github+json");
                    conn.setRequestProperty("User-Agent", "StarCube-Android/" + readAppVersionName());

                    int code = conn.getResponseCode();
                    if (code != HttpURLConnection.HTTP_OK) {
                        result.put("status", "error");
                        result.put("message", code == 403 ? "GitHub 请求频率受限，请稍后再试" : "检查更新失败（HTTP " + code + "）");
                        notifyUpdateResult(requestId, result);
                        return;
                    }

                    StringBuilder sb = new StringBuilder();
                    try (InputStream is = conn.getInputStream();
                         BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                    }

                    JSONObject release = new JSONObject(sb.toString());
                    String tag = release.optString("tag_name", "");
                    String htmlUrl = release.optString("html_url", RELEASES_PAGE_URL);
                    String body = release.optString("body", "");
                    String downloadUrl = htmlUrl;
                    String assetName = "";
                    boolean isApk = false;

                    JSONArray assets = release.optJSONArray("assets");
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject asset = assets.optJSONObject(i);
                            if (asset == null) continue;
                            String name = asset.optString("name", "");
                            String url = asset.optString("browser_download_url", "");
                            String lower = name.toLowerCase();
                            if (lower.endsWith(".apk") && !url.isEmpty()) {
                                if (!isApk) {
                                    downloadUrl = url;
                                    assetName = name;
                                    isApk = true;
                                }
                                if (lower.contains("release")) {
                                    downloadUrl = url;
                                    assetName = name;
                                    isApk = true;
                                    break;
                                }
                            }
                        }
                    }

                    result.put("status", "ok");
                    result.put("tag", tag);
                    result.put("notes", body);
                    result.put("htmlUrl", htmlUrl);
                    result.put("downloadUrl", downloadUrl);
                    result.put("assetName", assetName);
                    result.put("isApk", isApk);
                    notifyUpdateResult(requestId, result);
                } catch (UnknownHostException | ConnectException err) {
                    try {
                        result.put("status", "offline");
                        result.put("message", "当前未联网，离线模式不影响练习；联网后可再次检查更新");
                    } catch (Exception ignored) {}
                    notifyUpdateResult(requestId, result);
                } catch (SocketTimeoutException err) {
                    try {
                        result.put("status", "error");
                        result.put("message", "连接 GitHub 超时，请稍后再试");
                    } catch (Exception ignored) {}
                    notifyUpdateResult(requestId, result);
                } catch (Exception err) {
                    try {
                        result.put("status", "error");
                        result.put("message", "检查更新失败，可稍后再试");
                    } catch (Exception ignored) {}
                    notifyUpdateResult(requestId, result);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public boolean openExternalUrl(final String url) {
            if (!isAllowedExternalUrl(url)) {
                return false;
            }
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception err) {
                    Toast.makeText(MainActivity.this, "未找到可用的浏览器打开下载链接", Toast.LENGTH_SHORT).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public void onAppReady() {
            runOnUiThread(MainActivity.this::dismissSplashOverlay);
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean enabled) {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_KEEP_SCREEN_ON, enabled)
                .apply();
            runOnUiThread(() -> {
                Window window = getWindow();
                if (window == null) return;
                if (enabled) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void setSystemTheme(final String colorHex, final boolean isDark) {
            runOnUiThread(() -> applySystemTheme(colorHex, isDark, true));
        }

        @JavascriptInterface
        public void haptic(final String kind) {
            runOnUiThread(() -> {
                View target = getBridge() != null && getBridge().getWebView() != null
                    ? getBridge().getWebView()
                    : rootContentView;
                if (target == null) {
                    return;
                }
                int code = "ready".equals(kind)
                    ? HapticFeedbackConstants.CLOCK_TICK
                    : HapticFeedbackConstants.KEYBOARD_TAP;
                target.performHapticFeedback(code);
            });
        }

        @JavascriptInterface
        public void exportFile(final String requestId, final String filename, final String mimeType, final String content) {
            runOnUiThread(() -> {
                if (pendingExportRequestId != null) {
                    notifyExportResult(requestId, "error", "已有正在进行的保存操作，请先完成当前保存窗口");
                    return;
                }
                pendingExportRequestId = requestId;
                pendingExportContent = content != null ? content : "";

                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "application/octet-stream");
                intent.putExtra(Intent.EXTRA_TITLE, filename != null && !filename.isEmpty() ? filename : "starcube-export.txt");

                try {
                    exportDocumentLauncher.launch(intent);
                } catch (Exception err) {
                    pendingExportRequestId = null;
                    pendingExportContent = null;
                    notifyExportResult(requestId, "error", "无法打开系统文件保存窗口");
                }
            });
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::finish);
        }
    }
}
