package org.abulhasanalinadwi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * Opens the Nadwi Center website full-screen. Links to the site stay in the
 * app; everything else (Google Play, YouTube, email, downloads) opens in the
 * phone's own apps.
 */
public class MainActivity extends Activity {

    private static final int GREEN = Color.parseColor("#215F2F");

    private WebView web;
    private ProgressBar bar;
    private View offline;
    private TextView wakeNote;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable showWakeNote = () -> wakeNote.setVisibility(View.VISIBLE);
    private String siteHost;
    private WebChromeClient chrome;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        siteHost = Uri.parse(BuildConfig.SITE_URL).getHost();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        web = new WebView(this);
        root.addView(web, match());

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.getProgressDrawable().setTint(GREEN);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP));

        // the free server sleeps when idle; the first load can take ~1 minute
        wakeNote = new TextView(this);
        wakeNote.setText("Starting up… the first visit can take up to a minute.");
        wakeNote.setTextColor(Color.WHITE);
        wakeNote.setBackgroundColor(GREEN);
        wakeNote.setPadding(dp(16), dp(12), dp(16), dp(12));
        wakeNote.setGravity(Gravity.CENTER);
        wakeNote.setVisibility(View.GONE);
        root.addView(wakeNote, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        root.addView(offline, match());

        setContentView(root);
        setUpWebView();

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.SITE_URL);
    }

    private void setUpWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " NadwiCenterApp/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                boolean inSite = ("https".equals(scheme) || "http".equals(scheme)) && siteHost.equalsIgnoreCase(uri.getHost());
                if (inSite) return false;
                openOutside(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                bar.setVisibility(View.VISIBLE);
                handler.removeCallbacks(showWakeNote);
                handler.postDelayed(showWakeNote, 6000);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                bar.setVisibility(View.GONE);
                handler.removeCallbacks(showWakeNote);
                wakeNote.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    handler.removeCallbacks(showWakeNote);
                    wakeNote.setVisibility(View.GONE);
                    offline.setVisibility(View.VISIBLE);
                }
            }
        });

        chrome = new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                bar.setProgress(progress);
            }

            // full-screen video (YouTube players on the site)
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                ((FrameLayout) getWindow().getDecorView()).addView(view, match());
                web.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                ((FrameLayout) getWindow().getDecorView()).removeView(fullscreenView);
                fullscreenView = null;
                web.setVisibility(View.VISIBLE);
                if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
            }
        };
        web.setWebChromeClient(chrome);

        // MP3s, PDFs and other files: hand them to the phone's browser/download manager
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> openOutside(Uri.parse(url)));
    }

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));

        TextView title = new TextView(this);
        title.setText("Can’t reach the website");
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.parseColor("#1A1A1A"));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView msg = new TextView(this);
        msg.setText("Check your internet connection and try again.");
        msg.setTextSize(15);
        msg.setTextColor(Color.parseColor("#6B7280"));
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, dp(8), 0, dp(20));
        box.addView(msg);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundColor(GREEN);
        retry.setOnClickListener(v -> {
            offline.setVisibility(View.GONE);
            if (web.getUrl() == null) web.loadUrl(BuildConfig.SITE_URL); else web.reload();
        });
        box.addView(retry);
        return box;
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // nothing on the phone can open it
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            chrome.onHideCustomView();
        } else if (offline.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }
}
