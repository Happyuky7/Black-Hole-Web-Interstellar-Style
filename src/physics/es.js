// Página "La física", español. El LaTeX entre $…$ / $$…$$ lo renderiza KaTeX.
const r = String.raw;

export default {
  title: 'La física de un agujero negro, paso a paso',
  lead: r`Cómo el renderizador convierte las ecuaciones de Einstein en el color de cada píxel. Cada fórmula de esta página la usa el shader. En cada paso se explica qué significa, de dónde sale y dónde está en el código.`,
  sections: [
    {
      id: 'units', title: 'Notación y unidades',
      html: r`
<p>Usamos <b>unidades geométricas</b> $G = c = M = 1$, así que longitudes y tiempos se miden en unidades de la masa. Una unidad de longitud es el radio gravitacional $r_g = GM/c^2$. Para un agujero negro de $10^8$ masas solares son unos $1.5\times10^{8}$ km, más o menos la distancia Tierra–Sol. La signatura de la métrica es $(-,+,+,+)$.</p>
<p>El agujero negro queda descrito por dos números: su masa $M$ y su parámetro de giro</p>
$$a = \frac{J}{M}\qquad(-1 < a < 1),$$
<p>que en los controles aparece como $a^*$. $a = 0$ es un agujero sin rotación (Schwarzschild) y $a \to 1$ uno que gira al máximo.</p>`,
    },
    {
      id: 'metric', title: '1 · La métrica de Kerr',
      html: r`
<p>El espacio-tiempo alrededor de un agujero negro en rotación y sin carga es la solución de Kerr de las ecuaciones de Einstein (Kerr, 1963). En coordenadas de Boyer–Lindquist $(t, r, \theta, \phi)$ el elemento de línea es</p>
$$
ds^2 = -\Bigl(1 - \frac{2r}{\Sigma}\Bigr)dt^2 - \frac{4ar\sin^2\theta}{\Sigma}\,dt\,d\phi + \frac{\Sigma}{\Delta}\,dr^2 + \Sigma\,d\theta^2 + \frac{A\sin^2\theta}{\Sigma}\,d\phi^2 ,
$$
<p>construido a partir de tres funciones que aparecen en todo lo que sigue:</p>
<div class="result">$$
\Sigma = r^2 + a^2\cos^2\theta,\qquad
\Delta = r^2 - 2r + a^2,\qquad
A = (r^2+a^2)^2 - a^2\Delta\sin^2\theta .
$$</div>
<p><b>El horizonte</b> está donde $\Delta = 0$:</p>
$$ r_\pm = 1 \pm \sqrt{1 - a^2}. $$
<p>Nada que cruce el horizonte exterior $r_+$ vuelve. Para $a = 0$ es el conocido $r = 2M$, y se reduce hasta $r = M$ cuando $a \to 1$.</p>
<p><b>Arrastre del espacio.</b> El término cruzado $dt\,d\phi$ significa que el propio espacio es arrastrado alrededor del agujero. Un observador con momento angular cero es llevado con velocidad angular</p>
$$ \omega = -\frac{g_{t\phi}}{g_{\phi\phi}} = \frac{2ar}{A}. $$
<p class="code">En el código: <code>Σ</code>, <code>Δ</code> y <code>A</code> se recalculan en cada paso de cada rayo en <code>src/main.js</code>.</p>`,
    },
    {
      id: 'constants', title: '2 · Los rayos de luz y sus cantidades conservadas',
      html: r`
<p>La luz sigue <b>geodésicas nulas</b>: caminos con $ds^2 = 0$, lo más rectos que permite el espacio-tiempo curvo. Con el momento del fotón $p_\mu$, el hamiltoniano es</p>
$$ H = \tfrac12\, g^{\mu\nu} p_\mu p_\nu = 0 . $$
<p>La métrica de Kerr no depende de $t$ ni de $\phi$. Por el teorema de Noether se conservan dos componentes del momento: la energía $E = -p_t$ y el momento angular respecto al eje de giro $L_z = p_\phi$.</p>
<p>Carter (1968) descubrió una tercera constante oculta al separar la ecuación de Hamilton–Jacobi:</p>
$$ Q = p_\theta^2 + \cos^2\theta\left(\frac{L_z^2}{\sin^2\theta} - a^2E^2\right). $$
<p>La trayectoria de un fotón no depende de su energía (todos los colores se curvan igual), así que dividimos por $E$ y nos quedamos con dos números por rayo:</p>
<div class="result">$$ \lambda = \frac{L_z}{E}, \qquad \eta = \frac{Q}{E^2}. $$</div>
<p>Cada píxel de la imagen corresponde a un par $(\lambda, \eta)$, y esos dos números fijan toda la trayectoria del fotón.</p>`,
    },
    {
      id: 'equations', title: '3 · Las ecuaciones de movimiento',
      html: r`
<p>Con las tres constantes, las ecuaciones de las geodésicas se reducen a ecuaciones de primer orden, una por coordenada. Con el parámetro afín $\tau$:</p>
$$
\Sigma\frac{dr}{d\tau} = \pm\sqrt{R(r)},\qquad
\Sigma\frac{d\theta}{d\tau} = \pm\sqrt{\Theta(\theta)},\qquad
\Sigma\frac{d\phi}{d\tau} = \frac{\lambda}{\sin^2\theta} - a + \frac{aP}{\Delta},
$$
<p>con</p>
<div class="result">$$
P = r^2 + a^2 - a\lambda,\qquad
R(r) = P^2 - \Delta\bigl[\eta + (\lambda - a)^2\bigr],\qquad
\Theta(\theta) = \eta + a^2\cos^2\theta - \lambda^2\cot^2\theta .
$$</div>
<p><b>Tiempo de Mino.</b> El factor común $\Sigma$ acopla $r$ y $\theta$. Al definir un nuevo parámetro $\sigma$ con $d\tau = \Sigma\,d\sigma$ desaparece, y los movimientos radial y polar se vuelven independientes:</p>
$$ \frac{dr}{d\sigma} = \pm\sqrt{R},\qquad \frac{d\theta}{d\sigma} = \pm\sqrt{\Theta},\qquad \frac{d\phi}{d\sigma} = \frac{\lambda}{\sin^2\theta} - a + \frac{aP}{\Delta}. $$
<p><b>Cómo leer los potenciales.</b> Un fotón solo puede estar donde $R \ge 0$ y $\Theta \ge 0$. Donde $R = 0$ alcanza su máximo acercamiento y vuelve a alejarse; donde $\Theta = 0$ deja de avanzar hacia el polo y da la vuelta. Si $R > 0$ hasta el horizonte, el fotón queda atrapado. Eso es la <b>sombra</b> negra.</p>
<p><b>La esfera de fotones.</b> Los fotones pueden dar vueltas al agujero en órbitas inestables donde $R = R' = 0$. Para $a = 0$ ocurre en $r = 3$, con parámetro de impacto $b = 3\sqrt3 \approx 5.196$, que es el radio de la sombra vista desde lejos. En el plano ecuatorial de un agujero que gira, las dos órbitas circulares de fotones son</p>
$$ r_{\text{ph}} = 2\Bigl\{1 + \cos\Bigl[\tfrac23\arccos(\mp a)\Bigr]\Bigr\}, $$
<p>con el signo de arriba para órbitas progradas y el de abajo para retrógradas. La luz que roza esas órbitas da una o más vueltas antes de escapar, y eso dibuja el fino <b>anillo de fotones</b>.</p>`,
    },
    {
      id: 'second-order', title: '4 · Por qué el shader usa una forma de segundo orden',
      html: r`
<p>Los signos $\pm$ son un problema numérico: en un punto de retorno $\sqrt{R}$ se anula y el signo tiene que cambiar justo en el momento adecuado. Si se equivoca un poco, píxeles vecinos no coinciden, y aparecen estrellas rotas y costuras.</p>
<p>El truco es derivar una vez. A partir de $(dr/d\sigma)^2 = R$:</p>
$$ 2\,\frac{dr}{d\sigma}\frac{d^2r}{d\sigma^2} = R'(r)\,\frac{dr}{d\sigma}\quad\Longrightarrow\quad \frac{d^2r}{d\sigma^2} = \tfrac12 R'(r), $$
<p>y lo mismo para $\theta$. Con $p_r = dr/d\sigma$ y $p_\theta = d\theta/d\sigma$ queda un sistema suave, sin raíces:</p>
<div class="result">$$
\frac{dr}{d\sigma} = p_r,\quad
\frac{d\theta}{d\sigma} = p_\theta,\quad
\frac{dp_r}{d\sigma} = 2rP - (r-1)\bigl[\eta + (\lambda-a)^2\bigr],\quad
\frac{dp_\theta}{d\sigma} = -a^2\sin\theta\cos\theta + \lambda^2\frac{\cos\theta}{\sin^3\theta}.
$$</div>
<p>Ahora un punto de retorno es solo el momento en que $p_r$ cambia de signo, y la integración lo resuelve de forma natural. Las ecuaciones originales siguen valiendo como <b>ligadura</b>, $p_r^2 = R$ y $p_\theta^2 = \Theta$. El error numérico la va rompiendo poco a poco, así que después de cada paso el shader <b>la vuelve a imponer</b>: fija $|p_r| = \sqrt{R}$ y $|p_\theta| = \sqrt{\Theta}$ donde son positivos, manteniendo el signo que eligió la dinámica.</p>
<p class="code">En el código: <code>kerrDeriv()</code> es exactamente este lado derecho.</p>`,
    },
    {
      id: 'integration', title: '5 · Integrar 2 millones de rayos a 60 fps',
      html: r`
<p>Cada píxel hace su propia integración en un fragment shader de la GPU. En modo científico usa el clásico <b>Runge–Kutta 4</b>. Para un estado $y = (r, \theta, p_r, p_\theta, \phi)$ con $y' = f(y)$:</p>
$$
\begin{aligned}
k_1 &= f(y_n), & k_2 &= f\bigl(y_n + \tfrac{\Delta\sigma}{2}k_1\bigr),\\
k_3 &= f\bigl(y_n + \tfrac{\Delta\sigma}{2}k_2\bigr), & k_4 &= f\bigl(y_n + \Delta\sigma\,k_3\bigr),
\end{aligned}
\qquad
y_{n+1} = y_n + \frac{\Delta\sigma}{6}\bigl(k_1 + 2k_2 + 2k_3 + k_4\bigr).
$$
<p>El error local por paso es $\mathcal O(\Delta\sigma^5)$. Los modos artísticos usan en su lugar un leapfrog de segundo orden, más barato.</p>
<p><b>Paso adaptativo.</b> Cerca del agujero el espacio-tiempo se curva mucho y hacen falta pasos pequeños; lejos es casi plano y bastan pasos grandes. El paso se elige como</p>
$$ \Delta\sigma = \frac{h(r,\theta)}{\Sigma},\qquad h = \operatorname{mix}\bigl(0.02,\ 0.25,\ \operatorname{smoothstep}(r_+, 11, r)\bigr)\cdot\max\bigl(1, (r/8)^{3/2}\bigr)\cdot s_{\text{polo}}, $$
<p>donde $s_{\text{polo}}$ reduce el paso cerca del eje de giro, donde el término $\lambda^2/\sin^3\theta$ se vuelve rígido.</p>
<p><b>¿Qué tan preciso?</b> Se compararon 45 rayos de prueba con una referencia calculada con pasos 20 veces más pequeños. Con el mismo número de pasos, RK4 tiene un error mediano de $2.7\times10^{-3}$, frente a $1.9\times10^{-2}$ del leapfrog: unas 7 veces más preciso, y 15 veces mejor en el peor caso.</p>
<p><b>Cuándo termina un rayo.</b> Queda <i>atrapado</i> si llega a $r < r_+ + 0.05$ mientras sigue cayendo. <i>Escapa</i> cuando está lejos y alejándose; su dirección en el infinito se extrapola con</p>
$$ \theta_\infty \approx \theta + \frac{p_\theta}{|p_r|}\,r,\qquad \phi_\infty \approx \phi + \frac{\lambda}{r\sin^2\theta}, $$
<p>y se dibuja la estrella que hay en esa dirección. La amplificación por lente gravitacional sale gratis: el brillo superficial se conserva a lo largo de los rayos (teorema de Liouville), así que un trozo de cielo amplificado simplemente ocupa más píxeles.</p>`,
    },
    {
      id: 'camera', title: '6 · La cámara: de un píxel a un fotón',
      html: r`
<p>Una cámara real mide direcciones en su propio sistema local. La nuestra es un <b>ZAMO</b> (observador de momento angular cero): en reposo respecto al arrastre local del espacio, en cualquier posición fuera del horizonte. Su sistema local usa tres números:</p>
<div class="result">$$ \alpha = \sqrt{\frac{\Sigma\Delta}{A}}\ \ (\text{lapso}),\qquad \varpi = \sqrt{\frac{A}{\Sigma}}\,\sin\theta,\qquad \omega = \frac{2ar}{A}. $$</div>
<p>Un píxel en la posición $(x, y)$ de la pantalla mira en la dirección del vector unitario $\mathbf n = \operatorname{normalize}\bigl(\mathbf f + x\tan\tfrac{\text{fov}}{2}\,\mathbf r + y\tan\tfrac{\text{fov}}{2}\,\mathbf u\bigr)$, donde $\mathbf f$, $\mathbf r$ y $\mathbf u$ son los vectores adelante, derecha y arriba de la cámara. Sus componentes $(n_r, n_\theta, n_\phi)$ en el sistema local dan el momento del fotón (James et al. 2015, apéndice A):</p>
$$
E_F = \frac{1}{\alpha + \omega\varpi\,n_\phi},\qquad
p_r = E_F\frac{\sqrt\Sigma}{\sqrt\Delta}\,n_r,\qquad
p_\theta = E_F\sqrt\Sigma\,n_\theta,\qquad
p_\phi = E_F\,\varpi\,n_\phi .
$$
<p>De ahí, $\lambda = p_\phi$ y $\eta = p_\theta^2 + \cos^2\theta\,(\lambda^2/\sin^2\theta - a^2)$. Las velocidades iniciales son $dr/d\sigma = \Delta\,p_r$ y $d\theta/d\sigma = p_\theta$.</p>
<p>$E_F$ es la energía del fotón medida por la cámara por cada unidad de energía en el infinito. Cerca del agujero $E_F > 1$: la cámara está en el fondo de un pozo gravitatorio, así que la luz llega <b>corrida al azul</b>. Por eso las estrellas se ven más azules cuando te acercas volando.</p>
<p class="code">En el código: el bloque al principio de <code>main()</code> en el shader; los controles de vuelo en <code>updateCamera()</code>.</p>`,
    },
    {
      id: 'orbits', title: '7 · Cómo orbita el gas: órbitas circulares y la ISCO',
      html: r`
<p>El gas del disco se mueve en órbitas circulares progradas en el plano ecuatorial, con velocidad angular y componente temporal de la 4-velocidad</p>
<div class="result">$$ \Omega = \frac{1}{r^{3/2} + a},\qquad u^t = \frac{r^{3/2} + a}{\sqrt{r^3 - 3r^2 + 2a\,r^{3/2}}}. $$</div>
<p>Su energía y momento angular específicos son</p>
$$ E = \frac{r^{3/2} - 2r^{1/2} + a}{r^{3/4}\sqrt{r^{3/2} - 3r^{1/2} + 2a}},\qquad L = \frac{r^2 - 2a\,r^{1/2} + a^2}{r^{3/4}\sqrt{r^{3/2} - 3r^{1/2} + 2a}} . $$
<p>Cerca del agujero estas órbitas se vuelven <b>inestables</b>. La órbita circular estable más interna (ISCO) es el mínimo de $E(r)$ (Bardeen, Press y Teukolsky 1972):</p>
$$
\begin{aligned}
Z_1 &= 1 + (1-a^2)^{1/3}\bigl[(1+a)^{1/3} + (1-a)^{1/3}\bigr], \qquad Z_2 = \sqrt{3a^2 + Z_1^2},\\
r_{\text{ISCO}} &= 3 + Z_2 - \sqrt{(3 - Z_1)(3 + Z_1 + 2Z_2)} .
\end{aligned}
$$
<p>$r_{\text{ISCO}} = 6$ para $a = 0$ y tiende a $1$ cuando $a \to 1$. Dentro de ella el gas ya no orbita: se precipita hacia dentro. Por eso el disco tiene un borde interno.</p>
<p><b>Eficiencia.</b> El gas que baja en espiral hasta la ISCO ha radiado una fracción $\eta_{\text{rad}} = 1 - E_{\text{ISCO}}$ de su energía en reposo, con $E_{\text{ISCO}} = \sqrt{1 - 2/(3r_{\text{ISCO}})}$. Eso es un 5.7 % para $a = 0$ y hasta un 32 % para $a = 0.998$. La fusión nuclear llega al 0.7 %.</p>`,
    },
    {
      id: 'disk', title: '8 · ¿Qué tan caliente está el disco? (Novikov–Thorne)',
      html: r`
<p>La viscosidad hace que el gas pierda momento angular y caiga lentamente hacia dentro, calentándose. Cada anillo radia el calor que recibe. La conservación de la masa en reposo, la energía y el momento angular, más la condición de que el torque se anula en la ISCO, dan el flujo radiado por cada cara del disco (Novikov y Thorne 1973; Page y Thorne 1974):</p>
$$ F(r) = -\frac{\dot M}{4\pi\sqrt{-g}}\;\frac{\Omega_{,r}}{(E - \Omega L)^2}\int_{r_{\text{ISCO}}}^{r}(E - \Omega L)\,L_{,r}\,dr ,\qquad \sqrt{-g} = r . $$
<p>Para Kerr la integral tiene forma cerrada. Con $x = \sqrt r$, $x_0 = \sqrt{r_{\text{ISCO}}}$ y las tres raíces de $x^3 - 3x + 2a = 0$,</p>
$$ x_1 = 2\cos\tfrac{\arccos a - \pi}{3},\qquad x_2 = 2\cos\tfrac{\arccos a + \pi}{3},\qquad x_3 = -2\cos\tfrac{\arccos a}{3}, $$
<div class="result">$$
F(r) = \frac{3\dot M c^2}{8\pi r_g^2}\;
\frac{x - x_0 - \frac32 a\ln\frac{x}{x_0} - \displaystyle\sum_{i=1}^{3}\frac{3(x_i - a)^2}{x_i(x_i - x_j)(x_i - x_k)}\ln\frac{x - x_i}{x_0 - x_i}}{x^4\,(x^3 - 3x + 2a)} .
$$</div>
<p>Lejos del agujero tiende al newtoniano $F = 3GM\dot M/(8\pi r^3)$. Se anula en la ISCO y tiene su máximo un poco más afuera: en $r = 9.55$ para $a = 0$, el valor de los libros que reproduce el código.</p>
<p><b>Temperatura.</b> Cada anillo es un cuerpo negro, así que por la ley de Stefan–Boltzmann</p>
$$ T(r) = \bigl(F(r)/\sigma_{\text{SB}}\bigr)^{1/4} . $$
<p><b>Tasa de acreción.</b> Los controles fijan la masa $M$ y el cociente de Eddington $\lambda_{\text{Edd}} = L/L_{\text{Edd}}$, donde $L_{\text{Edd}} = 4\pi GMm_pc/\sigma_T \approx 1.26\times10^{31}\,\text{W}\,(M/M_\odot)$ es la luminosidad a la que la presión de radiación equilibra la gravedad. Entonces $\dot M = L/(\eta_{\text{rad}}c^2)$ y</p>
$$ T \propto \Bigl(\frac{\lambda_{\text{Edd}}}{M}\Bigr)^{1/4}, $$
<p>así que los agujeros más grandes tienen discos <i>más fríos</i>. Un cuásar de $10^8 M_\odot$ al 10 % de Eddington llega a unos $1.2\times10^5$ K (ultravioleta). Un agujero del tamaño de M87*, $6.5\times10^9 M_\odot$ a $10^{-4}$ de Eddington, llega a unos 7 600 K.</p>
<p class="code">En el código: <code>ntFlux()</code> en el shader; <code>diskPhysics()</code> en JavaScript calcula $\dot M$, $T_{\max}$ y las lecturas del panel.</p>`,
    },
    {
      id: 'redshift', title: '9 · Corrimiento, beaming y oscurecimiento al borde',
      html: r`
<p>La frecuencia que mide un detector es la proyección del momento del fotón sobre la 4-velocidad del detector, $\nu \propto -p_\mu u^\mu$. Para el gas en órbita:</p>
$$ -p_\mu u^\mu_{\text{em}} = -(p_t u^t + p_\phi u^\phi) = E\,u^t\,(1 - \Omega\lambda) . $$
<p>Dividiendo lo que mide la cámara entre lo que emitió el gas se obtiene el corrimiento total de frecuencia:</p>
<div class="result">$$ g = \frac{\nu_{\text{cam}}}{\nu_{\text{em}}} = \frac{E_F}{u^t\,(1 - \Omega\lambda)} . $$</div>
<p>Este único número contiene el efecto Doppler del gas que se acerca o se aleja, el corrimiento gravitacional al salir del pozo, el arrastre del espacio y la propia posición de la cámara. El gas que viene hacia la cámara tiene $g > 1$ y el que se aleja, $g < 1$.</p>
<p><b>El invariante.</b> A lo largo de cualquier rayo de luz se conserva $I_\nu/\nu^3$ (teorema de Liouville para fotones). Para un cuerpo negro de temperatura $T$ eso da</p>
$$ I_\nu^{\text{obs}}(\nu) = g^3\,B_\nu\!\left(\tfrac{\nu}{g},\,T\right) = B_\nu(\nu,\ gT) . $$
<p>Así que la cámara ve <b>exactamente un cuerpo negro a temperatura $gT$</b>. Más brillante por un lado ($\propto g^4$ en total, el llamado beaming relativista) y más azul por ese lado: las dos cosas salen de una sola ecuación, sin factores añadidos.</p>
<p><b>Oscurecimiento al borde.</b> La atmósfera de un disco real está dominada por la dispersión de electrones y se ve más oscura a ángulos rasantes (Chandrasekhar 1960). El coseno del ángulo de emisión en el sistema del gas es exacto:</p>
$$ \mu = \frac{\sqrt\eta}{r\,u^t(1 - \Omega\lambda)},\qquad I \propto 0.4213\,(1 + 2.06\,\mu), $$
<p>donde la constante mantiene igual el flujo total emitido.</p>`,
    },
    {
      id: 'colour', title: '10 · Del espectro al color del píxel',
      html: r`
<p>La cámara recibe un espectro de Planck a temperatura $gT$:</p>
$$ B_\lambda(T) = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{hc/\lambda k T} - 1} . $$
<p>La visión humana del color se resume en las funciones de igualación de color <b>CIE 1931</b> $\bar x, \bar y, \bar z$. El color percibido es</p>
$$ X = \int B_\lambda\,\bar x(\lambda)\,d\lambda,\qquad Y = \int B_\lambda\,\bar y(\lambda)\,d\lambda,\qquad Z = \int B_\lambda\,\bar z(\lambda)\,d\lambda , $$
<p>calculado con 24 muestras entre 380 y 780 nm. Las curvas usan el ajuste analítico de Wyman, Sloan y Shirley (2013). El resultado se convierte al sRGB lineal de la pantalla:</p>
$$
\begin{pmatrix}R\\G\\B\end{pmatrix} =
\begin{pmatrix} 3.2406 & -1.5372 & -0.4986\\ -0.9689 & 1.8758 & 0.0415\\ 0.0557 & -0.2040 & 1.0570\end{pmatrix}
\begin{pmatrix}X\\Y\\Z\end{pmatrix}.
$$
<p><b>Por qué los discos calientes se ven azul pálido.</b> Por encima de unos 20 000 K, la luz visible cae en la cola de Rayleigh–Jeans del espectro, donde el brillo solo crece como $T$. Por eso un disco muy caliente se ve de un blanco azulado bastante uniforme. Los discos más fríos están del lado de Wien, donde el brillo depende <i>exponencialmente</i> de la temperatura, así que el lado amplificado por Doppler se convierte en un punto deslumbrante. Prueba a bajar la tasa de acreción en modo científico.</p>
<p><b>Exposición.</b> Como un fotógrafo, el renderizador lleva la luminancia visible del anillo más caliente a un gris medio y deja margen para el lado amplificado. Después, un brillo suave hace de función de dispersión del objetivo, y el mapeo de tonos ACES produce la imagen final.</p>
<p class="code">En el código: <code>blackbodyXYZ()</code> y <code>blackbodyRGB()</code> en el shader; <code>cieTable()</code> en JavaScript.</p>`,
    },
    {
      id: 'film', title: '11 · ¿Y la película?',
      html: r`
<p>El renderizador hecho para <i>Interstellar</i> (DNGR, James et al. 2015) trazaba las mismas geodésicas de Kerr. Para la película, Christopher Nolan y el equipo de efectos tomaron decisiones artísticas a propósito:</p>
<ul>
<li>bajaron el giro a $a = 0.6$ para que la sombra se mantuviera redonda;</li>
<li>apagaron los corrimientos Doppler y gravitacional, porque el disco real, asimétrico y azul-rojo, les pareció demasiado confuso;</li>
<li>el disco tenía una temperatura uniforme de 4 500 K y textura hecha por artistas.</li>
</ul>
<p>Los presets <i>Interstellar</i> y <i>Cine</i> reproducen esas decisiones; <i>Cine</i> además usa la cámara de la película, en $r = 74.1$ y $\theta = 1.511$ rad. El preset <i>Científico</i> muestra lo que la película decidió no enseñar.</p>`,
    },
    {
      id: 'limits', title: '12 · Lo que sigue siendo aproximado',
      html: r`
<ul>
<li><b>Disco delgado.</b> Novikov–Thorne vale aproximadamente para $0.01 \lesssim \lambda_{\text{Edd}} \lesssim 0.3$. A tasas muy bajas (el M87* real) el flujo se vuelve un ADAF caliente y grueso.</li>
<li><b>Sin radiación que regresa.</b> La luz que se curva de vuelta hacia el disco no se reprocesa. Tampoco hay factor de endurecimiento espectral ni polarización.</li>
<li><b>Cámara estática.</b> La cámara es un ZAMO. Una cámara en órbita (como la Endurance) añadiría aberración y un corrimiento Doppler del cielo.</li>
<li><b>Imagen estática.</b> Se ignora el tiempo que tarda la luz en cruzar la escena.</li>
<li><b>Números finitos.</b> Los floats de 32 bits y el número limitado de pasos limitan cuántas imágenes de orden alto cerca del anillo de fotones se resuelven.</li>
</ul>
<p>Las referencias completas están en <a href="https://github.com/Happyuky7/Black-Hole-Web-Interstellar-Style/blob/master/docs/PHYSICS.md">docs/PHYSICS.md</a> (en inglés).</p>`,
    },
  ],
};
