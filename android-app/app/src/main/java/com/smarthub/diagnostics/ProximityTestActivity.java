package com.smarthub.diagnostics;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class ProximityTestActivity extends AppCompatActivity implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor proximitySensor;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_proximity_test);

        statusText = findViewById(R.id.proximityStatus);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);

        if (proximitySensor == null) {
            statusText.setText("No proximity sensor available");
            Toast.makeText(this, "No proximity sensor", Toast.LENGTH_LONG).show();
            // Finish after delay
            new android.os.Handler().postDelayed(this::finish, 2000);
        } else {
            sensorManager.registerListener(this, proximitySensor, SensorManager.SENSOR_DELAY_NORMAL);
            statusText.setText("Cover and uncover the top of the phone");
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float distance = event.values[0];
        String msg = distance < proximitySensor.getMaximumRange() ? "✅ Object near" : "🔘 Object far";
        statusText.setText("Distance: " + distance + " cm\n" + msg);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sensorManager != null) sensorManager.unregisterListener(this);
    }
}