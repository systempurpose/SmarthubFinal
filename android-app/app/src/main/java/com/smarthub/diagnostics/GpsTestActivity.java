package com.smarthub.diagnostics;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class GpsTestActivity extends AppCompatActivity {
    private static final int PERMISSION_REQUEST = 300;
    private LocationManager lm;
    private TextView status;
    private Button confirmBtn;
    private LocationListener listener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_gps_test);

        status = findViewById(R.id.statusText);
        confirmBtn = findViewById(R.id.confirmButton);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, PERMISSION_REQUEST);
            return;
        }
        startGps();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startGps();
            } else {
                Toast.makeText(this, "Location permission required", Toast.LENGTH_SHORT).show();
                finish();
            }
        }
    }

    private void startGps() {
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            status.setText("GPS is disabled. Please enable it in settings.");
            return;
        }

        confirmBtn.setEnabled(false);
        status.setText("Waiting for GPS fix (up to 30s)...");

        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                status.setText("GPS locked!\nLat: " + location.getLatitude() +
                        "\nLng: " + location.getLongitude() +
                        "\nAccuracy: " + location.getAccuracy() + "m");
                confirmBtn.setEnabled(true);
                lm.removeUpdates(this);
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };

        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 1, listener);
            // Timeout after 30 seconds
            new Handler().postDelayed(() -> {
                if (!confirmBtn.isEnabled()) {
                    status.setText("GPS timeout – no fix. Please try again.");
                    lm.removeUpdates(listener);
                }
            }, 30000);
        } catch (SecurityException e) {
            Toast.makeText(this, "GPS permission error", Toast.LENGTH_SHORT).show();
            finish();
        }

        confirmBtn.setOnClickListener(v -> finish());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (lm != null && listener != null) lm.removeUpdates(listener);
    }
}