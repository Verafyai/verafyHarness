# Renders data room slide 1: "Gas got cheap. Judgment got cheaper, faster." (1760x990 PNG)
# Run: python3 gas_chart.py  (needs matplotlib). Every point is sourced in the footer.
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.dates as md
from datetime import date
bg="#05080d"; sf="#0e141b"; tx="#dfe5eb"; mu="#9aa6b2"; teal="#5fe0c8"; amber="#e0b45f"; vio="#8b93ff"
plt.rcParams.update({"font.family":"DejaVu Sans","font.size":15,"text.color":tx,"axes.labelcolor":mu,"xtick.color":mu,"ytick.color":mu})
fig,ax=plt.subplots(figsize=(16,9),dpi=110); fig.patch.set_facecolor(bg); ax.set_facecolor(bg)
eth=[(date(2021,12,9),62.84),(date(2022,12,10),2.87),(date(2024,8,26),1.06),(date(2025,2,21),2.77),(date(2025,12,15),0.32),(date(2026,2,21),0.197)]
sol=[(date(2024,9,15),0.0013),(date(2025,5,23),0.0028),(date(2026,1,15),0.0008)]
jur=[(date(2023,3,14),0.375),(date(2024,7,18),0.0026),(date(2025,2,25),0.0013)]
meas=(date(2026,11,6),0.0163/5)
proj=[meas,(date(2027,11,6),meas[1]/10)]
def L(d,c,lab): ax.plot([a for a,b in d],[b for a,b in d],"-",color=c,lw=3,marker="o",ms=9,label=lab)
L(eth,vio,"Ethereum L1, average fee per transaction")
L(sol,amber,"Solana, typical fee per transaction")
L(jur,teal,"5-juror AI ruling, cheapest GPT-4-class model at the time (modeled)")
ax.plot([meas[0]],[meas[1]],marker="*",ms=24,color=teal,ls="none",label="Verafy ruling, 5 jurors from 5 labs, measured Nov 2026")
ax.plot([p[0] for p in proj],[p[1] for p in proj],"--",color=teal,lw=2.5,alpha=.7,label="Projection at 10x per year (modeled)")
ax.set_yscale("log"); ax.set_ylim(0.0001,150)
ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v,_: f"${v:g}"))
ax.xaxis.set_major_locator(md.YearLocator()); ax.xaxis.set_major_formatter(md.DateFormatter("%Y"))
ax.set_xlim(date(2021,9,1),date(2028,2,1))
for s in ax.spines.values(): s.set_color("#232c36")
ax.grid(True,which="major",color="#16202a",lw=1)
ax.set_ylabel("USD per action, log scale")
fig.text(0.06,0.93,"Gas got cheap. Judgment got cheaper, faster.",fontsize=26,fontweight="bold",color="#ffffff")
fig.text(0.06,0.885,"Ethereum fees fell about 300x in four years. A five-juror AI ruling fell about 300x in two, and keeps falling.",fontsize=16,color=mu)
ax.annotate("Measured: $0.0033 per ruling,\nabout 60x under an Ethereum\ntransaction (Feb 2026 average)",xy=meas,xytext=(date(2025,7,1),0.025),color=teal,fontsize=14,arrowprops=dict(arrowstyle="->",color=teal))
ax.text(date(2026,3,1),0.00045,"Solana floor: 5,000 lamports\nper signature, under $0.01",color=amber,fontsize=13)
leg=ax.legend(loc="upper right",frameon=True,fontsize=12.5); leg.get_frame().set_facecolor(sf); leg.get_frame().set_edgecolor("#232c36")
for t in leg.get_texts(): t.set_color(tx)
plt.subplots_adjust(left=0.08,right=0.97,top=0.85,bottom=0.19)
fig.text(0.06,0.035,"Sources. Ethereum average fee: bitinfocharts via Digital Money Box (Dec 2021, Dec 2022), CoinLedger (Aug 2024), YCharts (Feb 2025, Feb 2026), SQ Magazine (Dec 2025).\n"
"Solana: VALR (Sep 2024 median), MEXC and ETHNews (May 2025 average, Jan 2026 median).\n"
"Jury model: 5 jurors x 2,000 tokens at list prices of GPT-4 (Mar 2023), GPT-4o mini (Jul 2024), Gemini 2.0 Flash-Lite (Feb 2025), 3:1 input to output.\n"
"Measured: five live Verafy rulings on models from five labs, $0.0163 total. Epoch AI measures inference cost at fixed performance falling about 40x per year; the projection uses 10x.",fontsize=10.5,color=mu,linespacing=1.5)
fig.savefig("cost-of-judgment-vs-gas.png",facecolor=bg)
