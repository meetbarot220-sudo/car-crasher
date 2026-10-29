# 60 SECOND SURVIVAL — Arcade Driving Survival

An original fast-paced arcade vehicle survival game inspired by the frantic chase dynamics of *Smashy Road: Wanted 2*, built with 100% original code, procedural vehicle models, city environments, UI assets, synthesized audio, and visual identity.

---

## 🎯 Core Objective

**Survive for 60 seconds without losing all HP.**

- **Starting HP:** 1000 / 1000
- **Time limit:** Exactly 60.0 seconds
- **Damage budget:** Every collision deals damage based on velocity, angle, and vehicle armor (~50 HP normal bump).
- **Victory Condition:** Survive 60 seconds with >0 HP → **60 SECONDS SURVIVED!**
- **Defeat Condition:** Reach 0 HP → **VEHICLE DESTROYED**

---

## 🎮 Controls

| Action | Controls |
| :--- | :--- |
| **Accelerate** | `W` or `▲ Up Arrow` |
| **Steer Left** | `A` or `◄ Left Arrow` |
| **Brake / Reverse** | `S` or `▼ Down Arrow` |
| **Steer Right** | `D` or `► Right Arrow` |
| **Handbrake / Drift** | `SPACE` or `SHIFT` |

---

## 💥 Damage & Collision System

- **Light Bumps:** 30–50 HP (low speed glancing hits)
- **Normal Collisions:** ~50 HP (cruising contact with barriers, hydrants, trees)
- **Strong Collisions:** 75–120 HP (high-speed corner collisions)
- **Heavy Crashes:** 150–250 HP (head-on maximum speed crashes)
- **Visual Feedback:**
  - Floating damage numbers (e.g. `-50`, `-120`)
  - Spark bursts along the impact surface normal
  - Controlled camera shake (capped to prevent jitter or motion sickness)
  - Procedural sound crunches and sub-bass impacts
  - Smoke and flame emissions when vehicle integrity falls below 30%

---

## 🚗 Garage & Vehicle Archetypes

1. **Apex Cruiser (Balanced)**
   - Standard 1.0x damage multiplier
   - Balanced top speed (23 m/s) and agile turning
   - Neon Cyan street design

2. **Thunderbolt RS (Speed)**
   - Blistering top speed (28 m/s) and sharp drift response
   - Fragile panels take 25% higher crash damage (1.25x damage multiplier)
   - Racing Crimson with aerodynamic rear wing

3. **Titan Enforcer (Heavy)**
   - Reinforced steel push bumpers absorb 30% crash damage (0.70x damage multiplier)
   - Heavy chassis (19 m/s top speed), highly resistant to patrol vehicle rams
   - Industrial Amber & charcoal bullbars

---

## 🚨 Escalating AI Pressure Waves

The pursuit AI increases intensity over the 60-second survival window:
- **0–15s:** Low pressure (1–2 pursuit cars + ambient civilian traffic)
- **15–30s:** Moderate pressure (3 pursuit interceptors + active flanking)
- **30–45s:** High pressure (4 aggressive pursuers + traffic hazards)
- **45–60s:** Maximum pressure (5 interceptor units + ramming AI)

---

## 🚀 How to Run Locally

You can launch and play the game using any modern web browser:

```bash
# Option 1: Using Python built-in HTTP server
python -m http.server 8080
# Open http://localhost:8080 in Chrome, Edge, or Firefox
```

The game has **zero external package or npm dependencies** and uses local Three.js (`three.min.js`) and procedural Web Audio API synthesis for instant 60 FPS performance.
