import sys
for p in sys.argv[1:]:
    m = c = n = 0
    for z in open(p):
        t = z.split()
        if len(t) < 4: continue
        n += 1
        m = max(m, sum(int(x.split("=")[1]) for x in t[3].split(",") if "klient" not in x)); c = max(c, int(t[2]))
    print(p.split("/")[-1], "Dienst-Spitze", m, "MiB, CPU-Spitze aller Messcontainer", c, "%,", n, "Proben")
