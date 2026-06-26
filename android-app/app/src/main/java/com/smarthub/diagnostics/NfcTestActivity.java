package com.smarthub.diagnostics;

import android.content.pm.PackageManager;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class NfcTestActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_nfc_test);

        TextView status = findViewById(R.id.statusText);
        PackageManager pm = getPackageManager();
        boolean hasNfc = pm.hasSystemFeature("android.hardware.nfc");
        status.setText(hasNfc ? "✅ NFC present" : "❌ No NFC");
        Toast.makeText(this, hasNfc ? "NFC supported" : "No NFC", Toast.LENGTH_SHORT).show();

        new android.os.Handler().postDelayed(this::finish, 2000);
    }
}