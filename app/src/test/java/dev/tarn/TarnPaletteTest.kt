package dev.tarn

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.pow

class TarnPaletteTest {
    private fun luminance(color: Int): Double {
        fun linear(shift: Int): Double {
            val channel = ((color ushr shift) and 255) / 255.0
            return if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0)
    }
    private fun contrast(a: Int, b: Int): Double {
        val x = luminance(a)
        val y = luminance(b)
        return (maxOf(x, y) + 0.05) / (minOf(x, y) + 0.05)
    }
    @Test fun readableTextOnOpaqueSurfaces() {
        for (foreground in listOf(TarnPalette.SILVER, TarnPalette.SECONDARY, TarnPalette.MUTED)) {
            for (background in listOf(TarnPalette.BLACK, TarnPalette.MIDNIGHT, TarnPalette.DEEP_BLUE)) {
                assertTrue("Text contrast ${contrast(foreground, background)}", contrast(foreground, background) >= 4.5)
            }
        }
    }
    @Test fun primaryActionsAndFocusOutline() {
        assertTrue(contrast(TarnPalette.BLACK, TarnPalette.SILVER) >= 4.5)
        assertTrue(contrast(TarnPalette.BLACK, TarnPalette.LAKE_BLUE) >= 4.5)
        assertTrue(contrast(TarnPalette.LAKE_BLUE, TarnPalette.DEEP_BLUE) >= 3.0)
        assertTrue(contrast(TarnPalette.LAKE_BLUE, TarnPalette.MIDNIGHT) >= 3.0)
    }
}
