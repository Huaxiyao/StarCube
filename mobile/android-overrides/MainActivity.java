package com.starcube.timer;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
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
    private boolean bridgeAttached = false;
    private String pendingExportRequestId = null;
    private String pendingExportContent = null;
    private View rootContentView = null;

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

        applySystemTheme("#f3f4f6", false);
        attachNativeBridgeIfNeeded();

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
        bridgeAttached = true;
    }

    @SuppressWarnings("deprecation")
    private void applySystemTheme(String colorHex, boolean isDark) {
        int parsedColor;
        try {
            parsedColor = Color.parseColor(colorHex);
        } catch (Exception err) {
            parsedColor = isDark ? Color.parseColor("#0c0f14") : Color.parseColor("#f3f4f6");
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
        public void setSystemTheme(final String colorHex, final boolean isDark) {
            runOnUiThread(() -> applySystemTheme(colorHex, isDark));
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
