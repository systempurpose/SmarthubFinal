package com.smarthub.diagnostics;

import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
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

        // Reset counter on each new touch
        drawView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                runOnUiThread(() -> {
                    int count = drawView.getTouchCount() + 1;
                    drawView.setTouchCount(count);
                    touchCounter.setText("Touches: " + count);
                });
            }
            return false; // let drawView handle drawing
        });

        // Clear button
        findViewById(R.id.clearButton).setOnClickListener(v -> {
            drawView.clear();
            touchCounter.setText("Touches: 0");
        });
    }

    // Make DrawView a public static class to avoid inflation issues
    public static class DrawView extends View {
        private Path path = new Path();
        private Paint paint = new Paint();
        private int touchCount = 0;

        public DrawView(android.content.Context context, android.util.AttributeSet attrs) {
            super(context, attrs);
            paint.setColor(Color.BLUE);
            paint.setStrokeWidth(8f);
            paint.setStyle(Paint.Style.STROKE);
            paint.setAntiAlias(true);
        }

        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            super.onDraw(canvas);

            int width = getWidth();
            int height = getHeight();
            int size = Math.min(width, height) * 80 / 100;
            int left = (width - size) / 2;
            int top = (height - size) / 2;
            int right = left + size;
            int bottom = top + size;

            Paint guidePaint = new Paint();
            guidePaint.setColor(Color.LTGRAY);
            guidePaint.setStyle(Paint.Style.STROKE);
            guidePaint.setStrokeWidth(4f);
            canvas.drawRect(left, top, right, bottom, guidePaint);

            canvas.drawPath(path, paint);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            float x = event.getX();
            float y = event.getY();
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    path.moveTo(x, y);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    path.lineTo(x, y);
                    invalidate();
                    return true;
                default:
                    return super.onTouchEvent(event);
            }
        }

        public void setTouchCount(int count) {
            this.touchCount = count;
        }

        public int getTouchCount() {
            return touchCount;
        }

        public void clear() {
            path.reset();
            touchCount = 0;
            invalidate();
        }
    }
}