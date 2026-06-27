package com.atech.domus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.atech.domus.ui.DomusRoot
import com.atech.ui_shared.theme.DomusTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DomusTheme {
                DomusRoot()
            }
        }
    }
}
