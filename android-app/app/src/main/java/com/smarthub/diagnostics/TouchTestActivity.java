package com.smarthub.diagnostics;

import android.os.Bundle;
import android.view.MotionEvent;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class TouchTestActivity extends AppCompatActivity {

    private DrawView drawView;
    private TextView touchCounter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_touch_test);

        drawView = findViewById(R.id.drawView);
        touchCounter = findViewById(R.id.touchCounter);

        drawView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                runOnUiThread(() -> {
                    int count = drawView.getTouchCount() + 1;
                    drawView.setTouchCount(count);
                    touchCounter.setText("Touches: " + count);
                });
            }
            return false;
        });

        findViewById(R.id.clearButton).setOnClickListener(v -> {
            drawView.clear();
            touchCounter.setText("Touches: 0");
        });
    }
}