// "The physics" page, English. LaTeX between $…$ / $$…$$ is rendered by KaTeX.
// String.raw keeps the backslashes intact.
const r = String.raw;

export default {
  title: 'The physics of a black hole, step by step',
  lead: r`How the renderer turns Einstein's equations into the colour of each pixel. Every formula on this page is used by the shader. Each step says what it means, where it comes from, and where to find it in the code.`,
  sections: [
    {
      id: 'units', title: 'Notation and units',
      html: r`
<p>We use <b>geometric units</b> $G = c = M = 1$, so lengths and times are measured in units of the mass. One unit of length is the gravitational radius $r_g = GM/c^2$. For a black hole of $10^8$ solar masses that is about $1.5\times10^{8}$ km, roughly the Earth–Sun distance. The metric signature is $(-,+,+,+)$.</p>
<p>The black hole is described by two numbers: its mass $M$ and its spin parameter</p>
$$a = \frac{J}{M}\qquad(-1 < a < 1),$$
<p>written $a^*$ in the controls. $a = 0$ is a non-rotating (Schwarzschild) hole and $a \to 1$ is a maximally spinning one.</p>`,
    },
    {
      id: 'metric', title: '1 · The Kerr metric',
      html: r`
<p>Spacetime around a rotating, uncharged black hole is the Kerr solution of Einstein's equations (Kerr, 1963). In Boyer–Lindquist coordinates $(t, r, \theta, \phi)$ the line element is</p>
$$
ds^2 = -\Bigl(1 - \frac{2r}{\Sigma}\Bigr)dt^2 - \frac{4ar\sin^2\theta}{\Sigma}\,dt\,d\phi + \frac{\Sigma}{\Delta}\,dr^2 + \Sigma\,d\theta^2 + \frac{A\sin^2\theta}{\Sigma}\,d\phi^2 ,
$$
<p>built from three functions that appear everywhere below:</p>
<div class="result">$$
\Sigma = r^2 + a^2\cos^2\theta,\qquad
\Delta = r^2 - 2r + a^2,\qquad
A = (r^2+a^2)^2 - a^2\Delta\sin^2\theta .
$$</div>
<p><b>The horizon</b> is where $\Delta = 0$:</p>
$$ r_\pm = 1 \pm \sqrt{1 - a^2}. $$
<p>Nothing that crosses the outer horizon $r_+$ comes back. For $a = 0$ it is the familiar $r = 2M$, and it shrinks to $r = M$ as $a \to 1$.</p>
<p><b>Frame dragging.</b> The cross term $dt\,d\phi$ means space itself is dragged around the hole. An observer with zero angular momentum is carried along at angular velocity</p>
$$ \omega = -\frac{g_{t\phi}}{g_{\phi\phi}} = \frac{2ar}{A}. $$
<p class="code">In the code: <code>Σ</code>, <code>Δ</code> and <code>A</code> are recomputed at every step of every ray in <code>src/main.js</code>.</p>`,
    },
    {
      id: 'constants', title: '2 · Light rays and their conserved quantities',
      html: r`
<p>Light follows <b>null geodesics</b>: paths with $ds^2 = 0$ that are as straight as curved spacetime allows. With the photon momentum $p_\mu$, the Hamiltonian is</p>
$$ H = \tfrac12\, g^{\mu\nu} p_\mu p_\nu = 0 . $$
<p>The Kerr metric does not depend on $t$ or $\phi$. By Noether's theorem two components of the momentum are conserved: the energy $E = -p_t$ and the angular momentum about the spin axis $L_z = p_\phi$.</p>
<p>Carter (1968) discovered a hidden third constant by separating the Hamilton–Jacobi equation:</p>
$$ Q = p_\theta^2 + \cos^2\theta\left(\frac{L_z^2}{\sin^2\theta} - a^2E^2\right). $$
<p>A photon's path does not depend on its energy (all colours bend the same way), so we divide by $E$ and keep two numbers per ray:</p>
<div class="result">$$ \lambda = \frac{L_z}{E}, \qquad \eta = \frac{Q}{E^2}. $$</div>
<p>Each pixel of the image corresponds to one pair $(\lambda, \eta)$, and those two numbers fix the photon's entire trajectory.</p>`,
    },
    {
      id: 'equations', title: '3 · The equations of motion',
      html: r`
<p>With the three constants, the geodesic equations reduce to first-order equations, one per coordinate. Using the affine parameter $\tau$:</p>
$$
\Sigma\frac{dr}{d\tau} = \pm\sqrt{R(r)},\qquad
\Sigma\frac{d\theta}{d\tau} = \pm\sqrt{\Theta(\theta)},\qquad
\Sigma\frac{d\phi}{d\tau} = \frac{\lambda}{\sin^2\theta} - a + \frac{aP}{\Delta},
$$
<p>with</p>
<div class="result">$$
P = r^2 + a^2 - a\lambda,\qquad
R(r) = P^2 - \Delta\bigl[\eta + (\lambda - a)^2\bigr],\qquad
\Theta(\theta) = \eta + a^2\cos^2\theta - \lambda^2\cot^2\theta .
$$</div>
<p><b>Mino time.</b> The common factor $\Sigma$ couples $r$ and $\theta$. Defining a new parameter $\sigma$ by $d\tau = \Sigma\,d\sigma$ removes it, and the radial and polar motions become independent:</p>
$$ \frac{dr}{d\sigma} = \pm\sqrt{R},\qquad \frac{d\theta}{d\sigma} = \pm\sqrt{\Theta},\qquad \frac{d\phi}{d\sigma} = \frac{\lambda}{\sin^2\theta} - a + \frac{aP}{\Delta}. $$
<p><b>Reading the potentials.</b> A photon can only be where $R \ge 0$ and $\Theta \ge 0$. Where $R = 0$ it reaches its closest approach and turns back out; where $\Theta = 0$ it stops moving towards the pole and turns back. If $R > 0$ all the way down to the horizon, the photon is captured. That is the black <b>shadow</b>.</p>
<p><b>The photon sphere.</b> Photons can circle the hole on unstable orbits where $R = R' = 0$. For $a = 0$ that happens at $r = 3$, with impact parameter $b = 3\sqrt3 \approx 5.196$, which is the radius of the shadow seen from far away. In the equatorial plane of a spinning hole the two circular photon orbits are</p>
$$ r_{\text{ph}} = 2\Bigl\{1 + \cos\Bigl[\tfrac23\arccos(\mp a)\Bigr]\Bigr\}, $$
<p>with the upper sign for prograde orbits and the lower one for retrograde. Light that skims these orbits wraps around the hole one or more times before escaping, which is what draws the thin <b>photon ring</b>.</p>`,
    },
    {
      id: 'second-order', title: '4 · Why the shader uses a second-order form',
      html: r`
<p>The $\pm$ signs are a numerical nuisance: at a turning point $\sqrt{R}$ goes to zero and the sign has to flip at exactly the right moment. Get it slightly wrong and neighbouring pixels disagree, which shows up as broken stars and seams.</p>
<p>The trick is to differentiate once. From $(dr/d\sigma)^2 = R$:</p>
$$ 2\,\frac{dr}{d\sigma}\frac{d^2r}{d\sigma^2} = R'(r)\,\frac{dr}{d\sigma}\quad\Longrightarrow\quad \frac{d^2r}{d\sigma^2} = \tfrac12 R'(r), $$
<p>and in the same way for $\theta$. Writing $p_r = dr/d\sigma$ and $p_\theta = d\theta/d\sigma$ gives a smooth system with no square roots:</p>
<div class="result">$$
\frac{dr}{d\sigma} = p_r,\quad
\frac{d\theta}{d\sigma} = p_\theta,\quad
\frac{dp_r}{d\sigma} = 2rP - (r-1)\bigl[\eta + (\lambda-a)^2\bigr],\quad
\frac{dp_\theta}{d\sigma} = -a^2\sin\theta\cos\theta + \lambda^2\frac{\cos\theta}{\sin^3\theta}.
$$</div>
<p>A turning point is now just the moment $p_r$ changes sign, and the integration handles it naturally. The original equations survive as a <b>constraint</b>, $p_r^2 = R$ and $p_\theta^2 = \Theta$. Numerical error slowly breaks it, so after every step the shader <b>projects back</b>: it sets $|p_r| = \sqrt{R}$ and $|p_\theta| = \sqrt{\Theta}$ wherever those are positive, keeping the sign the dynamics chose.</p>
<p class="code">In the code: <code>kerrDeriv()</code> is exactly this right-hand side.</p>`,
    },
    {
      id: 'integration', title: '5 · Integrating 2 million rays at 60 fps',
      html: r`
<p>Each pixel runs its own integration in a fragment shader on the GPU. In scientific mode it uses the classic <b>Runge–Kutta 4</b> scheme. For a state $y = (r, \theta, p_r, p_\theta, \phi)$ with $y' = f(y)$:</p>
$$
\begin{aligned}
k_1 &= f(y_n), & k_2 &= f\bigl(y_n + \tfrac{\Delta\sigma}{2}k_1\bigr),\\
k_3 &= f\bigl(y_n + \tfrac{\Delta\sigma}{2}k_2\bigr), & k_4 &= f\bigl(y_n + \Delta\sigma\,k_3\bigr),
\end{aligned}
\qquad
y_{n+1} = y_n + \frac{\Delta\sigma}{6}\bigl(k_1 + 2k_2 + 2k_3 + k_4\bigr).
$$
<p>The local error per step is $\mathcal O(\Delta\sigma^5)$. The artistic modes use a cheaper second-order leapfrog instead.</p>
<p><b>Adaptive step.</b> Near the hole spacetime bends sharply and small steps are needed; far away it is almost flat and large steps are enough. The step is chosen as</p>
$$ \Delta\sigma = \frac{h(r,\theta)}{\Sigma},\qquad h = \operatorname{mix}\bigl(0.02,\ 0.25,\ \operatorname{smoothstep}(r_+, 11, r)\bigr)\cdot\max\bigl(1, (r/8)^{3/2}\bigr)\cdot s_{\text{pole}}, $$
<p>where $s_{\text{pole}}$ shrinks the step close to the spin axis, where the $\lambda^2/\sin^3\theta$ term becomes stiff.</p>
<p><b>How accurate?</b> 45 test rays were compared against a reference computed with 20× smaller steps. At the same number of steps, RK4 has a median error of $2.7\times10^{-3}$, against $1.9\times10^{-2}$ for leapfrog: about 7× more accurate, and 15× better in the worst case.</p>
<p><b>When a ray stops.</b> It is <i>captured</i> if it reaches $r < r_+ + 0.05$ while still falling. It <i>escapes</i> once it is far away and moving outward; its direction at infinity is then extrapolated with</p>
$$ \theta_\infty \approx \theta + \frac{p_\theta}{|p_r|}\,r,\qquad \phi_\infty \approx \phi + \frac{\lambda}{r\sin^2\theta}, $$
<p>and the star in that direction is drawn. Lensing magnification comes for free: surface brightness is conserved along rays (Liouville's theorem), so a magnified patch of sky simply covers more pixels.</p>`,
    },
    {
      id: 'camera', title: '6 · The camera: turning a pixel into a photon',
      html: r`
<p>A real camera measures directions in its own local frame. Ours is a <b>ZAMO</b> (zero-angular-momentum observer): at rest with respect to the local frame dragging, at any position outside the horizon. Its local frame uses three numbers:</p>
<div class="result">$$ \alpha = \sqrt{\frac{\Sigma\Delta}{A}}\ \ (\text{lapse}),\qquad \varpi = \sqrt{\frac{A}{\Sigma}}\,\sin\theta,\qquad \omega = \frac{2ar}{A}. $$</div>
<p>A pixel at screen position $(x, y)$ looks along the unit vector $\mathbf n = \operatorname{normalize}\bigl(\mathbf f + x\tan\tfrac{\text{fov}}{2}\,\mathbf r + y\tan\tfrac{\text{fov}}{2}\,\mathbf u\bigr)$, with $\mathbf f$, $\mathbf r$, $\mathbf u$ the camera's forward, right and up vectors. Its components $(n_r, n_\theta, n_\phi)$ in the local frame give the photon's momentum (James et al. 2015, appendix A):</p>
$$
E_F = \frac{1}{\alpha + \omega\varpi\,n_\phi},\qquad
p_r = E_F\frac{\sqrt\Sigma}{\sqrt\Delta}\,n_r,\qquad
p_\theta = E_F\sqrt\Sigma\,n_\theta,\qquad
p_\phi = E_F\,\varpi\,n_\phi .
$$
<p>From these, $\lambda = p_\phi$ and $\eta = p_\theta^2 + \cos^2\theta\,(\lambda^2/\sin^2\theta - a^2)$. The starting velocities are $dr/d\sigma = \Delta\,p_r$ and $d\theta/d\sigma = p_\theta$.</p>
<p>$E_F$ is the photon energy measured by the camera for each unit of energy at infinity. Close to the hole $E_F > 1$: the camera sits deep in a gravitational well, so incoming light arrives <b>blue-shifted</b>. That is why the stars turn bluer when you fly in.</p>
<p class="code">In the code: the block at the top of <code>main()</code> in the shader; the free-flight controls in <code>updateCamera()</code>.</p>`,
    },
    {
      id: 'orbits', title: '7 · How the gas orbits: circular orbits and the ISCO',
      html: r`
<p>The disk gas moves on prograde circular orbits in the equatorial plane, with angular velocity and time component of the 4-velocity</p>
<div class="result">$$ \Omega = \frac{1}{r^{3/2} + a},\qquad u^t = \frac{r^{3/2} + a}{\sqrt{r^3 - 3r^2 + 2a\,r^{3/2}}}. $$</div>
<p>Its specific energy and angular momentum are</p>
$$ E = \frac{r^{3/2} - 2r^{1/2} + a}{r^{3/4}\sqrt{r^{3/2} - 3r^{1/2} + 2a}},\qquad L = \frac{r^2 - 2a\,r^{1/2} + a^2}{r^{3/4}\sqrt{r^{3/2} - 3r^{1/2} + 2a}} . $$
<p>Close to the hole these orbits become <b>unstable</b>. The innermost stable circular orbit (ISCO) is the minimum of $E(r)$ (Bardeen, Press & Teukolsky 1972):</p>
$$
\begin{aligned}
Z_1 &= 1 + (1-a^2)^{1/3}\bigl[(1+a)^{1/3} + (1-a)^{1/3}\bigr], \qquad Z_2 = \sqrt{3a^2 + Z_1^2},\\
r_{\text{ISCO}} &= 3 + Z_2 - \sqrt{(3 - Z_1)(3 + Z_1 + 2Z_2)} .
\end{aligned}
$$
<p>$r_{\text{ISCO}} = 6$ for $a = 0$ and tends to $1$ as $a \to 1$. Inside it, gas no longer orbits; it plunges in. That is why the disk has an inner edge.</p>
<p><b>Efficiency.</b> Gas that spirals down to the ISCO has radiated a fraction $\eta_{\text{rad}} = 1 - E_{\text{ISCO}}$ of its rest-mass energy, with $E_{\text{ISCO}} = \sqrt{1 - 2/(3r_{\text{ISCO}})}$. That is 5.7 % for $a = 0$ and up to 32 % for $a = 0.998$. Nuclear fusion manages 0.7 %.</p>`,
    },
    {
      id: 'disk', title: '8 · How hot is the disk? (Novikov–Thorne)',
      html: r`
<p>Viscosity makes the gas lose angular momentum and drift inward slowly, heating it up. Every ring radiates away the heat it receives. Conservation of rest mass, energy and angular momentum, plus the condition that the torque vanishes at the ISCO, give the flux radiated from each face of the disk (Novikov & Thorne 1973; Page & Thorne 1974):</p>
$$ F(r) = -\frac{\dot M}{4\pi\sqrt{-g}}\;\frac{\Omega_{,r}}{(E - \Omega L)^2}\int_{r_{\text{ISCO}}}^{r}(E - \Omega L)\,L_{,r}\,dr ,\qquad \sqrt{-g} = r . $$
<p>For Kerr the integral can be done in closed form. With $x = \sqrt r$, $x_0 = \sqrt{r_{\text{ISCO}}}$ and the three roots of $x^3 - 3x + 2a = 0$,</p>
$$ x_1 = 2\cos\tfrac{\arccos a - \pi}{3},\qquad x_2 = 2\cos\tfrac{\arccos a + \pi}{3},\qquad x_3 = -2\cos\tfrac{\arccos a}{3}, $$
<div class="result">$$
F(r) = \frac{3\dot M c^2}{8\pi r_g^2}\;
\frac{x - x_0 - \frac32 a\ln\frac{x}{x_0} - \displaystyle\sum_{i=1}^{3}\frac{3(x_i - a)^2}{x_i(x_i - x_j)(x_i - x_k)}\ln\frac{x - x_i}{x_0 - x_i}}{x^4\,(x^3 - 3x + 2a)} .
$$</div>
<p>Far from the hole this tends to the Newtonian $F = 3GM\dot M/(8\pi r^3)$. It vanishes at the ISCO and peaks a little further out: at $r = 9.55$ for $a = 0$, the textbook value the code reproduces.</p>
<p><b>Temperature.</b> Each ring is a blackbody, so by the Stefan–Boltzmann law</p>
$$ T(r) = \bigl(F(r)/\sigma_{\text{SB}}\bigr)^{1/4} . $$
<p><b>Accretion rate.</b> The controls set the mass $M$ and the Eddington ratio $\lambda_{\text{Edd}} = L/L_{\text{Edd}}$, where $L_{\text{Edd}} = 4\pi GMm_pc/\sigma_T \approx 1.26\times10^{31}\,\text{W}\,(M/M_\odot)$ is the luminosity at which radiation pressure balances gravity. Then $\dot M = L/(\eta_{\text{rad}}c^2)$ and</p>
$$ T \propto \Bigl(\frac{\lambda_{\text{Edd}}}{M}\Bigr)^{1/4}, $$
<p>so bigger black holes have <i>cooler</i> disks. A quasar of $10^8 M_\odot$ at 10 % Eddington peaks around $1.2\times10^5$ K (ultraviolet). An M87*-sized hole of $6.5\times10^9 M_\odot$ at $10^{-4}$ Eddington peaks around 7 600 K.</p>
<p class="code">In the code: <code>ntFlux()</code> in the shader; <code>diskPhysics()</code> in JavaScript computes $\dot M$, $T_{\max}$ and the readouts.</p>`,
    },
    {
      id: 'redshift', title: '9 · Redshift, beaming and limb darkening',
      html: r`
<p>The frequency a detector measures is the projection of the photon momentum onto the detector's 4-velocity, $\nu \propto -p_\mu u^\mu$. For the orbiting gas:</p>
$$ -p_\mu u^\mu_{\text{em}} = -(p_t u^t + p_\phi u^\phi) = E\,u^t\,(1 - \Omega\lambda) . $$
<p>Dividing what the camera measures by what the gas emitted gives the total frequency shift:</p>
<div class="result">$$ g = \frac{\nu_{\text{cam}}}{\nu_{\text{em}}} = \frac{E_F}{u^t\,(1 - \Omega\lambda)} . $$</div>
<p>This single number contains the Doppler shift of gas moving towards or away from us, the gravitational redshift from climbing out of the well, frame dragging, and the camera's own position. Gas moving towards the camera has $g > 1$ and gas moving away has $g < 1$.</p>
<p><b>The invariant.</b> Along any light ray, $I_\nu/\nu^3$ is conserved (Liouville's theorem for photons). For a blackbody of temperature $T$ this gives</p>
$$ I_\nu^{\text{obs}}(\nu) = g^3\,B_\nu\!\left(\tfrac{\nu}{g},\,T\right) = B_\nu(\nu,\ gT) . $$
<p>So the camera sees <b>exactly a blackbody at temperature $gT$</b>. Brighter on one side ($\propto g^4$ in total, called relativistic beaming) and bluer on that side: both come out of one equation with no extra factors.</p>
<p><b>Limb darkening.</b> A real disk atmosphere is dominated by electron scattering and looks darker at grazing angles (Chandrasekhar 1960). The cosine of the emission angle in the gas frame is exact:</p>
$$ \mu = \frac{\sqrt\eta}{r\,u^t(1 - \Omega\lambda)},\qquad I \propto 0.4213\,(1 + 2.06\,\mu), $$
<p>where the constant keeps the total emitted flux unchanged.</p>`,
    },
    {
      id: 'colour', title: '10 · From spectrum to pixel colour',
      html: r`
<p>The camera receives a Planck spectrum at temperature $gT$:</p>
$$ B_\lambda(T) = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{hc/\lambda k T} - 1} . $$
<p>Human colour vision is summarised by the <b>CIE 1931</b> colour-matching functions $\bar x, \bar y, \bar z$. The perceived colour is</p>
$$ X = \int B_\lambda\,\bar x(\lambda)\,d\lambda,\qquad Y = \int B_\lambda\,\bar y(\lambda)\,d\lambda,\qquad Z = \int B_\lambda\,\bar z(\lambda)\,d\lambda , $$
<p>computed with 24 samples from 380 to 780 nm. The curves use the analytic multi-lobe fit of Wyman, Sloan & Shirley (2013). The result is converted to the screen's linear sRGB:</p>
$$
\begin{pmatrix}R\\G\\B\end{pmatrix} =
\begin{pmatrix} 3.2406 & -1.5372 & -0.4986\\ -0.9689 & 1.8758 & 0.0415\\ 0.0557 & -0.2040 & 1.0570\end{pmatrix}
\begin{pmatrix}X\\Y\\Z\end{pmatrix}.
$$
<p><b>Why hot disks look pale blue.</b> Above about 20 000 K, visible light sits on the Rayleigh–Jeans tail of the spectrum, where brightness only grows like $T$. A very hot disk therefore looks rather uniformly blue-white. Cooler disks sit on the Wien side, where brightness depends <i>exponentially</i> on temperature, so the Doppler-boosted side becomes a blazing spot. Try lowering the accretion rate in scientific mode.</p>
<p><b>Exposure.</b> Like a photographer, the renderer maps the visible luminance of the hottest ring to mid-grey, leaving headroom for the boosted side. A mild glow then stands in for the lens's point-spread function, and ACES tone mapping produces the final image.</p>
<p class="code">In the code: <code>blackbodyXYZ()</code> and <code>blackbodyRGB()</code> in the shader; <code>cieTable()</code> in JavaScript.</p>`,
    },
    {
      id: 'film', title: '11 · And the movie?',
      html: r`
<p>The renderer built for <i>Interstellar</i> (DNGR, James et al. 2015) traced the same Kerr geodesics. For the film, Christopher Nolan and the VFX team made deliberate artistic choices:</p>
<ul>
<li>the spin was reduced to $a = 0.6$ so the shadow would stay round;</li>
<li>the Doppler and gravitational frequency shifts were switched off, because the real lopsided, blue-and-red disk was judged too confusing;</li>
<li>the disk was a uniform 4 500 K, with texture by artists.</li>
</ul>
<p>The <i>Interstellar</i> and <i>Cinema</i> presets reproduce those choices; <i>Cinema</i> also uses the film's camera at $r = 74.1$ and $\theta = 1.511$ rad. The <i>Scientific</i> preset shows what the film chose not to.</p>`,
    },
    {
      id: 'limits', title: '12 · What is still approximate',
      html: r`
<ul>
<li><b>Thin disk.</b> Novikov–Thorne is valid roughly for $0.01 \lesssim \lambda_{\text{Edd}} \lesssim 0.3$. At very low rates (the real M87*) the flow becomes a hot, thick ADAF.</li>
<li><b>No returning radiation.</b> Light bent back onto the disk is not reprocessed. There is also no spectral hardening factor and no polarisation.</li>
<li><b>Static camera.</b> The camera is a ZAMO. An orbiting camera (like the Endurance) would add aberration and a Doppler shift of the sky.</li>
<li><b>Static snapshot.</b> Light travel time across the scene is ignored.</li>
<li><b>Finite numerics.</b> 32-bit floats and a finite step budget limit how many high-order images near the photon ring are resolved.</li>
</ul>
<p>Full references are in <a href="https://github.com/Happyuky7/Black-Hole-Web-Interstellar-Style/blob/master/docs/PHYSICS.md">docs/PHYSICS.md</a>.</p>`,
    },
  ],
};
