package com.smarthub.diagnostics;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.os.Handler;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class ProximityTestActivity extends AppCompatActivity implements SensorEventListener {
    private SensorManager sm;
    private Sensor proximity;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_proximity_test);
        status = findViewById(R.id.proximityStatus);
        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        proximity = sm.getDefaultSensor(Sensor.TYPE_PROXIMITY);
        if (proximity == null) {
            status.setText("No proximity sensor");
            Toast.makeText(this, "No proximity sensor", Toast.LENGTH_LONG).show();
            new Handler().postDelayed(this::finish, 2000);
        } else {
            sm.registerListener(this, proximity, SensorManager.SENSOR_DELAY_NORMAL);
            status.setText("Cover/uncover the top of the phone");
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float distance = event.values[0];
        String msg = distance < proximity.getMaximumRange() ? "Object near" : "Object far";
        status.setText("Distance: " + distance + " cm\n" + msg);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sm != null) sm.unregisterListener(this);
    }
}