# The physics behind the renderer

*Black Hole Web v1.0.0 · released 9 October 2026 · sources verified 9 October 2026*

This page explains every equation the shader uses, how it is integrated on the GPU, how accurate it is, and what is still an approximation.

The app has a friendlier version of this page: open **The physics** from the start screen or go to `/physics`. It walks through the same derivation step by step, with rendered equations, in English and Spanish.

The renderer has two families of modes:

- **Scientific** (the *Scientific* preset, or the *Full physics* toggle) uses only physical models. Everything on this page applies.
- **Artistic** (*Interstellar*, *Cinema*, *Clean Kerr*, *Edge-on*) uses the **same light paths**, but the disk colour, texture, haze, flare and grain are designed to look like the film instead of being computed from first principles. See [Artistic modes](#9-artistic-modes).

## Contents

1. [Units and the Kerr metric](#1-units-and-the-kerr-metric)
2. [Photon geodesics](#2-photon-geodesics)
3. [Integrating on the GPU](#3-integrating-on-the-gpu)
4. [The camera](#4-the-camera)
5. [Escaping rays and the sky](#5-escaping-rays-and-the-sky)
6. [The accretion disk (Novikov–Thorne)](#6-the-accretion-disk-novikovthorne)
7. [Redshift, beaming and limb darkening](#7-redshift-beaming-and-limb-darkening)
8. [From spectrum to pixel colour](#8-from-spectrum-to-pixel-colour)
9. [Artistic modes](#9-artistic-modes)
10. [What is still approximate](#10-what-is-still-approximate)
11. [References](#11-references)

---

## 1. Units and the Kerr metric

Geometric units are used throughout: $G = c = M = 1$. Radii are in gravitational radii $r_g = GM/c^2$, and the spin is $a = J/M \in (-1, 1)$, written $a^*$ in the UI.

In Boyer–Lindquist coordinates $(t, r, \theta, \phi)$, the Kerr metric is built from

$$
\Sigma = r^2 + a^2\cos^2\theta, \qquad
\Delta = r^2 - 2r + a^2, \qquad
A = (r^2 + a^2)^2 - a^2 \Delta \sin^2\theta .
$$

The outer horizon is $r_+ = 1 + \sqrt{1 - a^2}$.

## 2. Photon geodesics

A photon has three conserved quantities (Carter 1968). We normalise the energy at infinity to $E = 1$:

- $\lambda = L_z / E$, the axial angular momentum;
- $\eta = Q / E^2$, the Carter constant.

The equations separate when written in **Mino time** $\sigma$, defined by $d\tau = \Sigma\, d\sigma$ where $\tau$ is the affine parameter:

$$
\left(\frac{dr}{d\sigma}\right)^2 = R(r) = P^2 - \Delta\left[\eta + (\lambda - a)^2\right],
\qquad P = r^2 + a^2 - a\lambda,
$$

$$
\left(\frac{d\theta}{d\sigma}\right)^2 = \Theta(\theta) = \eta + a^2\cos^2\theta - \lambda^2\cot^2\theta,
$$

$$
\frac{d\phi}{d\sigma} = \frac{\lambda}{\sin^2\theta} - a + \frac{aP}{\Delta}.
$$

The square roots change sign at turning points, which is awkward to handle numerically. Differentiating once gives a smooth **second-order** system instead:

$$
\frac{d^2 r}{d\sigma^2} = \tfrac12 R'(r) = 2rP - (r - 1)\left[\eta + (\lambda - a)^2\right],
\qquad
\frac{d^2\theta}{d\sigma^2} = \tfrac12 \Theta'(\theta) = -a^2 \sin\theta\cos\theta + \lambda^2 \frac{\cos\theta}{\sin^3\theta}.
$$

The state $(r, \theta, p_r, p_\theta, \phi)$ with $p_r = dr/d\sigma$ and $p_\theta = d\theta/d\sigma$ passes through turning points without any special case. Neighbouring pixels therefore map to neighbouring sky directions, which keeps stars sharp.

## 3. Integrating on the GPU

Every pixel integrates its own photon backwards from the camera in a fragment shader, using one of two schemes.

| Mode | Scheme | Order | Evaluations per step |
|---|---|---|---|
| Artistic | Leapfrog (kick–drift–kick); the $\lambda/\sin^2\theta$ term of $\phi$ is integrated analytically over each drift | 2 | 2 |
| Scientific | Classic Runge–Kutta 4 on $(r, \theta, p_r, p_\theta, \phi)$ | 4 | 4 |

After every step, both schemes **project back onto the null constraint**. They set $|p_r| = \sqrt{R}$ and $|p_\theta| = \sqrt{\Theta}$ where those are positive, and keep the sign the dynamics produced. This removes the slow drift that otherwise lets rays bounce out of the hole.

**Step size.** The step is taken in Mino time as $d\sigma = h / \Sigma$, so $h$ behaves like an affine step:

$$
h = \mathrm{mix}\!\left(0.02,\ 0.25,\ \mathrm{smoothstep}(r_+, 11, r)\right)\cdot \max\!\left(1, (r/8)^{3/2}\right)\cdot s_{\text{pole}} \cdot q .
$$

Steps are small near the horizon and grow far away, where space is nearly flat. $s_{\text{pole}} = \mathrm{clamp}(|\sin\theta|/0.15,\ 0.06,\ 1)$ resolves the stiff $\lambda^2/\sin^3\theta$ barrier near the spin axis. $q$ is the quality setting: 1.22 for Fast, 1 for Pro, 0.82 for Ultra.

**Polar rays.** If a ray's polar turning point lies within about 0.01 rad of the axis ($\lambda^2 < 10^{-4}(\eta + a^2)$), it is treated as passing straight over the pole while it is within 0.2 rad of it: $\phi$ flips by $\pi$ there. Far from the axis this is indistinguishable from the exact path, and it avoids a seam along the image column $\alpha = 0$.

**Termination.** A ray stops when one of these happens:

- it is captured: $r < r_+ + 0.05$ while still moving inward;
- it escapes: $r > \max(1.15\, r_{\text{cam}} + 4.5,\ 60)$ while moving outward;
- the disk becomes opaque in front of it;
- it runs out of steps (480 on Pro). A ray that runs out of steps while skimming the photon sphere counts as captured.

### Measured accuracy

The test used 45 rays across the image, with $a = 0.9$, inclination 80° and the camera at $r = 40$. Each was compared against RK4 with steps 20× smaller. The error is $|\Delta r|$ of the first disk crossing (in $M$) plus $|\Delta\theta| + |\Delta\phi|$ of the escape direction (in rad).

| Scheme (same step schedule) | Median error | 90th percentile | Max | Avg. steps |
|---|---|---|---|---|
| Leapfrog + projection | 1.9 × 10⁻² | 3.8 × 10⁻² | 3.6 × 10⁻¹ | 174 |
| **RK4 + projection** | **2.7 × 10⁻³** | **1.1 × 10⁻²** | **2.3 × 10⁻²** | 174 |
| RK4, 1.5× larger steps | 7.7 × 10⁻³ | 2.1 × 10⁻² | 5.5 × 10⁻² | 116 |

At the same step count, RK4 is about **7× more accurate** (median) and **15× better** in the worst case. Each step costs twice as many evaluations.

## 4. The camera

The camera can sit anywhere outside the horizon. It is a **ZAMO**, a zero-angular-momentum observer at rest relative to the local frame dragging. Its position is converted to Boyer–Lindquist coordinates through the oblate-spheroidal relation. Each pixel direction is then expressed in the camera's local orthonormal frame $(e_r, e_\theta, e_\phi)$ as a unit vector $(n_r, n_\theta, n_\phi)$.

Following appendix A of James et al. (2015), with

$$
\alpha = \sqrt{\frac{\Sigma\Delta}{A}}, \qquad
\varpi = \sqrt{\frac{A}{\Sigma}}\sin\theta, \qquad
\omega = \frac{2ar}{A},
$$

the photon's momentum components are

$$
E_F = \frac{1}{\alpha + \omega\varpi\, n_\phi}, \qquad
p_r = E_F \frac{\sqrt{\Sigma}}{\sqrt\Delta} n_r, \qquad
p_\theta = E_F \sqrt{\Sigma}\, n_\theta, \qquad
p_\phi = E_F\, \varpi\, n_\phi .
$$

From these, $\lambda = p_\phi$ and $\eta = p_\theta^2 + \cos^2\theta\,(\lambda^2/\sin^2\theta - a^2)$. The initial Mino-time velocities are $dr/d\sigma = \Delta\, p_r$ and $d\theta/d\sigma = p_\theta$.

$E_F$ is the photon energy measured by the camera per unit energy at infinity. It enters every frequency shift below.

## 5. Escaping rays and the sky

A ray stops at a finite radius, so its direction is extrapolated to infinity using $d\theta/dr \approx p_\theta / r^2$ and $d\phi/dr \approx \lambda / (r^2\sin^2\theta)$:

$$
\theta_\infty \approx \theta + \frac{p_\theta}{|p_r|}\, r, \qquad
\phi_\infty \approx \phi + \frac{\lambda}{r \sin^2\theta}.
$$

The sky is then looked up in that direction. In scientific mode, each procedural star is a blackbody between 2 800 and 30 000 K. The camera sees it as a blackbody at $E_F\, T$: starlight is blue-shifted when you are deep in the potential well. Gravitational lensing magnification comes for free from the ray tracing, because surface brightness is conserved (Liouville's theorem).

## 6. The accretion disk (Novikov–Thorne)

In scientific mode the disk is the standard relativistic thin disk of Novikov & Thorne (1973). It is geometrically thin, optically thick, lies in the equatorial plane, and its gas moves on prograde circular geodesics down to the ISCO, where the torque vanishes.

**ISCO** (Bardeen, Press & Teukolsky 1972):

$$
Z_1 = 1 + (1-a^2)^{1/3}\left[(1+a)^{1/3} + (1-a)^{1/3}\right],\quad
Z_2 = \sqrt{3a^2 + Z_1^2},\quad
r_{\text{ISCO}} = 3 + Z_2 \mp \sqrt{(3 - Z_1)(3 + Z_1 + 2Z_2)} .
$$

**Efficiency and accretion rate.** The radiative efficiency is $\eta_{\text{rad}} = 1 - E_{\text{ISCO}}$, with $E_{\text{ISCO}} = \sqrt{1 - 2/(3 r_{\text{ISCO}})}$. That gives 5.7 % at $a = 0$, 15.6 % at $a = 0.9$ and 32.1 % at $a = 0.998$.

The UI sets the mass $M$ and the Eddington ratio $\lambda_{\text{Edd}}$:

$$
L = \lambda_{\text{Edd}}\, L_{\text{Edd}}, \quad L_{\text{Edd}} = 1.2572\times10^{31}\ \text{W}\ (M/M_\odot), \qquad \dot M = \frac{L}{\eta_{\text{rad}}\, c^2}.
$$

**Flux** (Page & Thorne 1974). Let $x = \sqrt{r}$, $x_0 = \sqrt{r_{\text{ISCO}}}$, and let $x_{1,2,3}$ be the roots of $x^3 - 3x + 2a = 0$:

$$
x_1 = 2\cos\!\tfrac{\arccos a - \pi}{3}, \quad x_2 = 2\cos\!\tfrac{\arccos a + \pi}{3}, \quad x_3 = -2\cos\!\tfrac{\arccos a}{3} .
$$

Then

$$
F(r) = \frac{3\dot M c^2}{8\pi r_g^2}\;
\frac{x - x_0 - \tfrac32 a \ln\frac{x}{x_0} - \sum_{i} \frac{3(x_i - a)^2}{x_i (x_i - x_j)(x_i - x_k)} \ln\frac{x - x_i}{x_0 - x_i}}{x^4\,(x^3 - 3x + 2a)} .
$$

The local blackbody temperature is $T(r) = (F/\sigma_{SB})^{1/4}$.

Sanity checks of this implementation:
- The flux peaks at $r = 9.55\,M$ for $a = 0$ (the textbook value), at 5.95 for $a = 0.6$ and at 3.44 for $a = 0.9$.
- It tends to the Newtonian $3GM\dot M / 8\pi r^3$ shape at large radius.
- At spin 0 one root is 0. Its term has limit 0 and is guarded against 0/0.

Typical numbers: $10^8 M_\odot$ at 10 % Eddington gives $T_{\max} \approx 1.2\times10^5$ K, a hot blue-white disk. The *Scientific* preset uses an M87\*-like $6.5\times10^9 M_\odot$ at $10^{-4}$ Eddington, which gives $T_{\max} \approx 7.6\times10^3$ K.

## 7. Redshift, beaming and limb darkening

The gas orbits with

$$
\Omega = \frac{1}{r^{3/2} + a}, \qquad
u^t = \frac{r^{3/2} + a}{\sqrt{r^3 - 3r^2 + 2a r^{3/2}}} .
$$

The photon energy in the gas frame is $E_{\text{em}} = u^t(1 - \Omega\lambda)$. The total frequency shift from emitter to camera, which includes Doppler, gravitational redshift and frame dragging exactly, is

$$
g = \frac{\nu_{\text{cam}}}{\nu_{\text{em}}} = \frac{E_F}{u^t (1 - \Omega \lambda)} .
$$

Because $I_\nu / \nu^3$ is invariant along a ray, a blackbody at temperature $T$ is seen as **a blackbody at $gT$**:

$$
g^3 B_\nu(\nu/g,\, T) = B_\nu(\nu,\, gT).
$$

Relativistic beaming ($\propto g^4$ bolometrically) and the colour shift therefore both follow automatically, with no extra factors.

**Limb darkening.** The disk atmosphere is dominated by electron scattering (Chandrasekhar 1960). The cosine of the emission angle in the gas frame is exact:

$$
\mu = \frac{|p_{(\theta)}|}{E_{\text{em}}} = \frac{\sqrt{\eta}}{r\, u^t (1 - \Omega\lambda)}, \qquad
I \propto (1 + 2.06\,\mu)\cdot 0.4213 ,
$$

The factor 0.4213 is $\tfrac{1/2}{1/2 + 2.06/3}$, which keeps the emitted flux equal to that of an isotropic surface.

The disk is optically thick: the first crossing inside $[r_{\text{ISCO}}, r_{\text{out}}]$ is opaque. Higher-order images (the lensed arc, the photon ring) come from rays that cross the equator outside the disk first.

## 8. From spectrum to pixel colour

The observed spectrum $B_\lambda(gT)$ is integrated against the **CIE 1931** colour-matching functions at 24 wavelengths between 380 and 780 nm. The functions use the multi-lobe Gaussian fit of Wyman, Sloan & Shirley (2013), precomputed in JavaScript and passed to the shader as a uniform. The result is converted from XYZ to linear sRGB (D65). Out-of-gamut values are clipped at 0, which matters for very hot, very blue disks.

**Exposure.** A real camera needs an exposure. The visible luminance of the hottest ring at $g = 1$ is mapped to about 0.4, so Doppler-boosted regions keep some headroom. The *Exposure* slider scales this. After that, a mild HDR bloom stands in for the lens's point-spread function, and ACES tone mapping is applied. In scientific mode there is no grain, flare, chromatic aberration, vignette or haze.

Why do hot disks look evenly blue-white while cool ones show a dramatic bright spot? Above roughly 20 000 K the visible band sits on the Rayleigh–Jeans tail, where brightness only scales as $\propto T$. Cool disks sit on the Wien side, where visible brightness is exponentially sensitive to $g$. Both behaviours are physical.

## 9. Artistic modes

These modes share the geodesics and the camera from sections 2–5, but:

- **Disk colour** comes from a hand-tuned temperature ramp, not a spectrum. **Doppler / beaming** applies $g^{k}$ with a user-chosen exponent $k$, as a brightness factor $g^{4k}$ plus a tint. The film (and the *Interstellar* / *Cinema* presets) used $k = 0$.
- **Texture**: orbit-advected noise lanes and streaks that are periodic in $\phi$, with a partially transparent outer disk.
- **Haze**: an optically thin glowing layer of height $H = 0.035r + 0.05$ above and below the disk.
- **Lens effects**: anamorphic streak, chromatic aberration, film grain and 2.39:1 letterbox.

The *Cinema* preset uses the film's camera from James et al. (2015): $a = 0.6$, $r_c = 74.1\,M$, $\theta_c = 1.511$ rad.

## 10. What is still approximate

The scientific mode is meant to be honest. These are the things it does **not** model:

- **Thin-disk assumption.** Novikov–Thorne holds roughly for $0.01 \lesssim \lambda_{\text{Edd}} \lesssim 0.3$. At very low rates, such as the real M87\*, the flow becomes a hot, thick ADAF, which this code does not simulate. At very high rates the disk puffs up.
- **No returning radiation.** Disk light that is bent back onto the disk is not re-processed.
- **No spectral hardening.** The colour-correction factor $f_{\text{col}}$ of real disk atmospheres (Compton scattering) is not applied, so the spectrum is a pure local blackbody.
- **No polarisation** and no absorption or emission along the ray outside the disk. There is no jet and no corona.
- **The camera is a ZAMO.** A camera on an orbit (like the Endurance) would add aberration and a Doppler shift of the sky.
- **Static snapshot.** Light travel time across the scene is ignored.
- **Finite numerics.** 32-bit floats, a finite step budget, and a limited number of high-order images near the photon ring.

## 11. References

Every DOI below was checked against [Crossref](https://www.crossref.org/) and every arXiv identifier against the arXiv API (October 2026). Book chapters without a DOI link to their NASA ADS record or the publisher. Each entry says which formulas it backs. The in-app page (`/physics#sources`) shows the same list, and each section there cites its own sources.

1. R. P. Kerr (1963), *Gravitational Field of a Spinning Mass as an Example of Algebraically Special Metrics*, Physical Review Letters 11, 237–238. [doi:10.1103/PhysRevLett.11.237](https://doi.org/10.1103/PhysRevLett.11.237)  
   *Backs:* The Kerr metric itself: the spacetime of a rotating black hole.
2. R. H. Boyer & R. W. Lindquist (1967), *Maximal Analytic Extension of the Kerr Metric*, Journal of Mathematical Physics 8, 265–281. [doi:10.1063/1.1705193](https://doi.org/10.1063/1.1705193)  
   *Backs:* Boyer–Lindquist coordinates, Σ, Δ, and the horizons r± = 1 ± √(1 − a²).
3. B. Carter (1968), *Global Structure of the Kerr Family of Gravitational Fields*, Physical Review 174, 1559–1571. [doi:10.1103/PhysRev.174.1559](https://doi.org/10.1103/PhysRev.174.1559)  
   *Backs:* Separability of the geodesic equations and the Carter constant Q.
4. J. M. Bardeen, W. H. Press & S. A. Teukolsky (1972), *Rotating Black Holes: Locally Nonrotating Frames, Energy Extraction, and Scalar Synchrotron Radiation*, The Astrophysical Journal 178, 347. [doi:10.1086/151796](https://doi.org/10.1086/151796)  
   *Backs:* ZAMO frame (α, ϖ, ω), circular orbits (Ω, uᵗ, E, L), the ISCO formula, equatorial photon orbits.
5. J. M. Bardeen (1973), *Timelike and null geodesics in the Kerr metric*, Black Holes (Les Houches 1972), eds. C. & B. S. DeWitt, Gordon and Breach, pp. 215–239. [NASA ADS](https://ui.adsabs.harvard.edu/abs/1973blho.conf..215B)  
   *Backs:* The radial and polar potentials R(r), Θ(θ), the conserved λ, η and the shadow of a Kerr hole.
6. E. Teo (2003), *Spherical Photon Orbits Around a Kerr Black Hole*, General Relativity and Gravitation 35, 1909–1926. [doi:10.1023/A:1026286607562](https://doi.org/10.1023/A:1026286607562)  
   *Backs:* Photon orbits and the photon sphere/shell, r_ph = 2{1 + cos[⅔ arccos(∓a)]}.
7. Y. Mino (2003), *Perturbative approach to an orbital evolution around a supermassive black hole*, Physical Review D 67, 084027. [doi:10.1103/PhysRevD.67.084027](https://doi.org/10.1103/PhysRevD.67.084027) · [arXiv:gr-qc/0302075](https://arxiv.org/abs/gr-qc/0302075)  
   *Backs:* Mino time dτ = Σ dσ, which decouples the radial and polar motion.
8. S. E. Gralla & A. Lupsasca (2020), *Null geodesics of the Kerr exterior*, Physical Review D 101, 044032. [doi:10.1103/PhysRevD.101.044032](https://doi.org/10.1103/PhysRevD.101.044032) · [arXiv:1910.12881](https://arxiv.org/abs/1910.12881)  
   *Backs:* A modern, complete treatment of Kerr light rays: R, Θ, turning points, photon shell, Mino-time solutions.
9. C. Runge (1895), *Ueber die numerische Auflösung von Differentialgleichungen*, Mathematische Annalen 46, 167–178. [doi:10.1007/BF01446807](https://doi.org/10.1007/BF01446807)  
   *Backs:* Origin of the Runge–Kutta family of integrators (RK4, completed by Kutta in 1901).
10. E. Hairer, C. Lubich & G. Wanner (2006), *Geometric Numerical Integration (2nd ed.)*, Springer Series in Computational Mathematics 31. [doi:10.1007/3-540-30666-8](https://doi.org/10.1007/3-540-30666-8)  
   *Backs:* The leapfrog (Störmer–Verlet) scheme and projection onto invariants/constraints after each step.
11. O. James, E. von Tunzelmann, P. Franklin & K. S. Thorne (2015), *Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar*, Classical and Quantum Gravity 32, 065001. [doi:10.1088/0264-9381/32/6/065001](https://doi.org/10.1088/0264-9381/32/6/065001) · [arXiv:1502.03808](https://arxiv.org/abs/1502.03808)  
   *Backs:* The camera equations (E_F, p_r, p_θ, p_φ from a pixel direction, appendix A) and the film’s choices (a = 0.6, no Doppler, camera at r = 74.1).
12. I. D. Novikov & K. S. Thorne (1973), *Astrophysics of black holes*, Black Holes (Les Houches 1972), eds. C. & B. S. DeWitt, Gordon and Breach, pp. 343–450. [NASA ADS](https://ui.adsabs.harvard.edu/abs/1973blho.conf..343N)  
   *Backs:* The relativistic thin accretion disk model (geometrically thin, optically thick, zero torque at the ISCO).
13. D. N. Page & K. S. Thorne (1974), *Disk-Accretion onto a Black Hole. Time-Averaged Structure of Accretion Disk*, The Astrophysical Journal 191, 499. [doi:10.1086/152990](https://doi.org/10.1086/152990)  
   *Backs:* The flux F(r) in integral form and its closed form with the roots x₁, x₂, x₃.
14. K. S. Thorne (1974), *Disk-Accretion onto a Black Hole. II. Evolution of the Hole*, The Astrophysical Journal 191, 507. [doi:10.1086/152991](https://doi.org/10.1086/152991)  
   *Backs:* The astrophysical spin limit a ≈ 0.998 used by the Edge-on preset, and the efficiency 1 − E_ISCO.
15. N. I. Shakura & R. A. Sunyaev (1973), *Black holes in binary systems. Observational appearance*, Astronomy & Astrophysics 24, 337–355. [NASA ADS](https://ui.adsabs.harvard.edu/abs/1973A%26A....24..337S)  
   *Backs:* The standard (α) thin-disk theory that Novikov–Thorne generalises to general relativity.
16. J. Frank, A. King & D. Raine (2002), *Accretion Power in Astrophysics (3rd ed.)*, Cambridge University Press. [doi:10.1017/CBO9781139164245](https://doi.org/10.1017/CBO9781139164245)  
   *Backs:* Eddington luminosity L_Edd = 4πGMm_p c/σ_T, Ṁ = L/(ηc²) and the thin-disk temperature scaling.
17. R. Narayan & I. Yi (1994), *Advection-dominated accretion: A self-similar solution*, The Astrophysical Journal 428, L13. [doi:10.1086/187381](https://doi.org/10.1086/187381)  
   *Backs:* Why thin disks fail at very low accretion rates (ADAFs), a stated limitation.
18. C. T. Cunningham & J. M. Bardeen (1973), *The Optical Appearance of a Star Orbiting an Extreme Kerr Black Hole*, The Astrophysical Journal 183, 237. [doi:10.1086/152223](https://doi.org/10.1086/152223)  
   *Backs:* Redshift and Doppler boosting of a source on a circular Kerr orbit, seen through the lensed geometry.
19. C. T. Cunningham (1975), *The effects of redshifts and focusing on the spectrum of an accretion disk around a Kerr black hole*, The Astrophysical Journal 202, 788. [doi:10.1086/154033](https://doi.org/10.1086/154033)  
   *Backs:* The shift g = 1/[uᵗ(1 − Ωλ)] for disk emission and the observed disk spectrum.
20. C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), *Gravitation (§22.6, kinetic theory of photons)*, W. H. Freeman (reissued by Princeton University Press, 2017). [NASA ADS](https://ui.adsabs.harvard.edu/abs/1973grav.book.....M)  
   *Backs:* Geometric units, null geodesics, and the invariance of I_ν/ν³ along a ray (Liouville).
21. S. Chandrasekhar (1960), *Radiative Transfer*, Dover Publications. [NASA ADS](https://ui.adsabs.harvard.edu/abs/1960ratr.book.....C)  
   *Backs:* Limb darkening of an electron-scattering atmosphere, I ∝ 1 + 2.06 μ.
22. M. Planck (1901), *Ueber das Gesetz der Energieverteilung im Normalspectrum*, Annalen der Physik 309, 553–563. [doi:10.1002/andp.19013090310](https://doi.org/10.1002/andp.19013090310)  
   *Backs:* The blackbody spectrum B_λ(T).
23. G. B. Rybicki & A. P. Lightman (1979), *Radiative Processes in Astrophysics*, Wiley. [doi:10.1002/9783527618170](https://doi.org/10.1002/9783527618170)  
   *Backs:* Stefan–Boltzmann law T = (F/σ)^¼, Planck function, Thomson cross-section and the Eddington limit.
24. ISO / CIE (2019), *ISO/CIE 11664-1:2019 Colorimetry — Part 1: CIE standard colorimetric observers*, International Organization for Standardization (defines the CIE 1931 observer). [iso.org](https://www.iso.org/standard/74164.html)  
   *Backs:* The CIE 1931 colour-matching functions x̄, ȳ, z̄ used to turn a spectrum into a colour.
25. C. Wyman, P.-P. Sloan & P. Shirley (2013), *Simple Analytic Approximations to the CIE XYZ Color Matching Functions*, Journal of Computer Graphics Techniques 2(2), 1–11. [jcgt.org](https://jcgt.org/published/0002/02/01/)  
   *Backs:* The multi-lobe Gaussian fit of x̄, ȳ, z̄ evaluated in the shader.
26. IEC (1999), *IEC 61966-2-1:1999 Multimedia systems and equipment — Colour measurement and management — Part 2-1: Default RGB colour space — sRGB*, International Electrotechnical Commission. [webstore.iec.ch](https://webstore.iec.ch/publication/6169)  
   *Backs:* The XYZ → linear sRGB matrix (D65 white point).
27. Event Horizon Telescope Collaboration (2019), *First M87 Event Horizon Telescope Results. I. The Shadow of the Supermassive Black Hole*, The Astrophysical Journal Letters 875, L1. [doi:10.3847/2041-8213/ab0ec7](https://doi.org/10.3847/2041-8213/ab0ec7) · [arXiv:1906.11238](https://arxiv.org/abs/1906.11238)  
   *Backs:* The M87* mass (6.5 × 10⁹ M☉) used by the Scientific preset.
