package com.example.bsodtester

import android.app.Service
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.view.View
import android.view.WindowManager
import android.widget.TextView

class BlueScreenOverlayService : Service() {
    
    private lateinit var windowManager: WindowManager
    private lateinit var blueScreenView: View
    
    override fun onCreate() {
        super.onCreate()
        
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createBlueScreen()
    }
    
    private fun createBlueScreen() {
        blueScreenView = object : View(this) {
            private val paint = Paint()
            private var counter = 0
            private val handler = Handler(mainLooper)
            
            init {
                setBackgroundColor(Color.BLUE)
                
                // Update counter every second
                handler.post(object : Runnable {
                    override fun run() {
                        counter++
                        invalidate()
                        handler.postDelayed(this, 1000)
                    }
                })
            }
            
            override fun onDraw(canvas: Canvas) {
                super.onDraw(canvas)
                
                val width = width.toFloat()
                val height = height.toFloat()
                
                paint.color = Color.WHITE
                paint.textSize = width / 15
                paint.textAlign = Paint.Align.CENTER
                
                // Draw sad face
                canvas.drawText(":( ", width / 2, height / 3, paint)
                
                paint.textSize = width / 20
                canvas.drawText("Your device ran into a problem", width / 2, height / 2.5f, paint)
                
                paint.textSize = width / 25
                canvas.drawText("SYSTEM_SERVICE_EXCEPTION", width / 2, height / 2, paint)
                
                paint.textSize = width / 30
                canvas.drawText("What failed: System UI", width / 2, height / 1.7f, paint)
                
                // Stop codes
                paint.textSize = width / 35
                paint.color = Color.LTGRAY
                canvas.drawText("*** Stop: 0x0000001A", width / 2, height / 1.5f, paint)
                canvas.drawText("***   core.odex", width / 2, height / 1.45f, paint)
                
                // Recovery instructions
                paint.textSize = width / 28
                paint.color = Color.WHITE
                canvas.drawText("RECOVERY INSTRUCTIONS:", width / 2, height / 1.2f, paint)
                
                paint.textSize = width / 32
                canvas.drawText("Press and hold VOLUME DOWN + POWER", width / 2, height / 1.15f, paint)
                canvas.drawText("for 10 seconds to force restart", width / 2, height / 1.1f, paint)
                
                // Counter
                paint.textSize = width / 35
                canvas.drawText("System will freeze in: ${10 - counter}s", width / 2, height / 1.05f, paint)
                
                if (counter >= 10) {
                    // Cause complete freeze
                    while (true) {
                        // Infinite loop to freeze
                        Thread.sleep(1000)
                    }
                }
            }
        }
        
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        )
        
        windowManager.addView(blueScreenView, params)
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        try {
            windowManager.removeView(blueScreenView)
        } catch (e: Exception) {
            // View already removed
        }
    }
}