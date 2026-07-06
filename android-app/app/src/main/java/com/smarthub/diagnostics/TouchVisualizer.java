package com.smarthub.diagnostics;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

public class TouchVisualizer extends View {
    private final Paint paint = new Paint();
    private final List<float[]> touchPoints = new ArrayList<>();

    public TouchVisualizer(Context context) {
        super(context);
        init();
    }

    public TouchVisualizer(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paint.setColor(0xFF2196F3);
        paint.setStyle(Paint.Style.FILL);
        paint.setAntiAlias(true);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        touchPoints.clear();
        for (int i = 0; i < event.getPointerCount(); i++) {
            touchPoints.add(new float[]{event.getX(i), event.getY(i)});
        }
        invalidate();
        return true;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (float[] pt : touchPoints) {
            canvas.drawCircle(pt[0], pt[1], 40, paint);
        }
    }
}