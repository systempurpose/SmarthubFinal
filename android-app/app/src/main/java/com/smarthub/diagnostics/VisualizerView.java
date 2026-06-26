package com.smarthub.diagnostics;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;

public class VisualizerView extends View {
    private byte[] waveform;
    private Paint paint = new Paint();

    public VisualizerView(Context context, AttributeSet attrs) {
        super(context, attrs);
        paint.setColor(Color.CYAN);
        paint.setStrokeWidth(4f);
    }

    public void updateWaveform(byte[] data) {
        this.waveform = data;
        postInvalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (waveform == null) return;
        int width = getWidth();
        int height = getHeight();
        int step = Math.max(1, waveform.length / width);
        canvas.drawColor(Color.BLACK);
        for (int i = 0; i < width; i++) {
            int index = i * step;
            if (index >= waveform.length) break;
            byte val = waveform[index];
            float barHeight = (val + 128) / 256f * height;
            canvas.drawLine(i, height, i, height - barHeight, paint);
        }
    }
}