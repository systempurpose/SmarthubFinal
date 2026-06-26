package com.smarthub.diagnostics;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class GyroTestActivity extends AppCompatActivity implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private TextView angleText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_gyro_test);

        angleText = findViewById(R.id.angleText);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        if (accelerometer == null) {
            angleText.setText("Accelerometer not available");
            Toast.makeText(this, "No accelerometer", Toast.LENGTH_LONG).show();
            new android.os.Handler().postDelayed(this::finish, 2000);
        } else {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
            angleText.setText("Tilt the phone in any direction");
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        double pitch = Math.atan2(x, Math.sqrt(y*y + z*z)) * 180 / Math.PI;
        double roll = Math.atan2(y, z) * 180 / Math.PI;
        angleText.setText("Pitch: " + String.format("%.1f", pitch) + "°\nRoll: " + String.format("%.1f", roll) + "°");
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sensorManager != null) sensorManager.unregisterListener(this);
    }
}