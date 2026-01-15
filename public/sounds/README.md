# Scan Feedback Audio Files

This directory contains audio files for scan feedback in the mobile batch binding flow.

## Required Files

1. **scan-success.mp3** (~30kb)
   - Short, soft tick sound
   - Plays on successful bind or already_bound
   - Should be subtle and non-intrusive

2. **scan-rebind.mp3** (~30kb)
   - Lower chime/alert sound
   - Plays when rebind is detected
   - Should be distinct from success but not alarming

## Usage

Audio is OFF by default. Users can toggle it on via the Active Session screen.

## Recommended Sources

- [Freesound.org](https://freesound.org) - Free sound effects
- [Mixkit](https://mixkit.co/free-sound-effects/) - Free sound effects
- Generate programmatically using Web Audio API

## Fallback

If audio files are not present, the system gracefully degrades to haptic-only feedback.

