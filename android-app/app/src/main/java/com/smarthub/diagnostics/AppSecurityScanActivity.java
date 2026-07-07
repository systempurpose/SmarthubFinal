package com.smarthub.diagnostics;

import android.os.Bundle;
import android.os.Handler;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.io.File;

public class AppSecurityScanActivity extends AppCompatActivity {

    private TextView tvStatus;
    private TextView tvMessage;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_app_security_scan);

        tvStatus = findViewById(R.id.tvStatus);
        tvMessage = findViewById(R.id.tvMessage);
        progressBar = findViewById(R.id.progressBar);

        showHelperMessage();
    }

    private void showHelperMessage() {
        tvStatus.setText("📡 Assisting SmartHub Windows app...");
        progressBar.setVisibility(ProgressBar.VISIBLE);
        tvMessage.setVisibility(TextView.GONE);

        // Simulate scan in progress
        new Handler().postDelayed(() -> {
            File dir = getExternalFilesDir(null);
            if (dir == null) dir = getFilesDir();
            File reportFile = new File(dir, "smarthub_diagnostics.json");

            if (!reportFile.exists()) {
                tvStatus.setText("⚠️ No report found");
                progressBar.setVisibility(ProgressBar.GONE);
                tvMessage.setVisibility(TextView.VISIBLE);
                tvMessage.setText("Please connect your device to the SmartHub desktop app and run a scan.");
                return;
            }

            // Success: helper is working
            tvStatus.setText("✅ Scan data ready");
            progressBar.setVisibility(ProgressBar.GONE);
            tvMessage.setVisibility(TextView.VISIBLE);
            tvMessage.setText("The Windows app is now displaying the scan results. Check the desktop for details.");

        }, 2000); // Simulate some work
    }
}