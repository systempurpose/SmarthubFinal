package com.smarthub.diagnostics;

import android.content.pm.PackageManager;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class FingerprintTestActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_fingerprint_test);

        TextView status = findViewById(R.id.statusText);
        PackageManager pm = getPackageManager();
        boolean hasFingerprint = pm.hasSystemFeature("android.hardware.fingerprint");
        status.setText(hasFingerprint ? "✅ Fingerprint sensor present" : "❌ No fingerprint sensor");
        Toast.makeText(this, hasFingerprint ? "Fingerprint supported" : "No fingerprint", Toast.LENGTH_SHORT).show();

        new android.os.Handler().postDelayed(this::finish, 2000);
    }
}