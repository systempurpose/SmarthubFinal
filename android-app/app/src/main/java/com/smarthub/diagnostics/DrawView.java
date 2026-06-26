package com.smarthub.diagnostics;

import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.MotionEvent;
import android.view.View;

public class DrawView extends View {
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
        int w = getWidth(), h = getHeight();
        int size = Math.min(w, h) * 80 / 100;
        int left = (w - size) / 2, top = (h - size) / 2;
        Paint guide = new Paint();
        guide.setColor(Color.LTGRAY);
        guide.setStyle(Paint.Style.STROKE);
        guide.setStrokeWidth(4f);
        canvas.drawRect(left, top, left + size, top + size, guide);
        canvas.drawPath(path, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX(), y = event.getY();
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

    public void setTouchCount(int count) { this.touchCount = count; }
    public int getTouchCount() { return touchCount; }
    public void clear() { path.reset(); touchCount = 0; invalidate(); }
}