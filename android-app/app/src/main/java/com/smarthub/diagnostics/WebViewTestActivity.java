package com.smarthub.diagnostics;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class WebViewTestActivity extends AppCompatActivity {
    private WebView webView;
    private TextView statusText;
    private Button passButton, failButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_webview_test);

        webView = findViewById(R.id.webView);
        statusText = findViewById(R.id.statusText);
        passButton = findViewById(R.id.passButton);
        failButton = findViewById(R.id.failButton);

        String url = getIntent().getStringExtra("url");
        String testName = getIntent().getStringExtra("testName");

        if (url == null) {
            statusText.setText("No URL provided");
            finish();
            return;
        }

        statusText.setText("Loading " + testName + "...");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                statusText.setText("Page loaded – did it work?");
                passButton.setEnabled(true);
                failButton.setEnabled(true);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                statusText.setText("Error loading page – did it work?");
                passButton.setEnabled(true);
                failButton.setEnabled(true);
            }
        });
        webView.getSettings().setJavaScriptEnabled(true);
        webView.loadUrl(url);

        passButton.setOnClickListener(v -> {
            setResult(RESULT_OK);
            finish();
        });
        failButton.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
    }
}