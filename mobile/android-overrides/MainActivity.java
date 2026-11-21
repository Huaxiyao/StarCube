package com.starcube.timer;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String PREFS_NAME = "starcube_ui_prefs";
    private static final String KEY_THEME_BG = "theme_bg";
    private static final String KEY_THEME_DARK = "theme_dark";
    private static final long MIN_SPLASH_MS = 340L;
    private static final long MAX_SPLASH_MS = 1800L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean bridgeAttached = false;
    private boolean splashDismissed = false;
    private long splashShownAtMs = 0L;
    private String pendingExportRequestId = null;
    private String pendingExportContent = null;
    private ViewGroup rootContentView = null;
    private FrameLayout splashOverlay = null;
    private LinearLayout splashBrandBox = null;

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

        // 魔方练习期间保持屏幕常亮，避免观察或思考时息屏
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedBg = prefs.getString(KEY_THEME_BG, "#f3f4f6");
        boolean savedDark = prefs.getBoolean(KEY_THEME_DARK, false);

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

    private final class StarCubeAndroidBridge {
        @JavascriptInterface
        public void onAppReady() {
            runOnUiThread(MainActivity.this::dismissSplashOverlay);
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
