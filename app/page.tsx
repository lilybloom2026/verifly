import ClientScene from "@/components/ClientScene";
import Prover from "@/components/Prover";
import Sections from "@/components/Sections";

export default function Page() {
  return (
    <main id="top">
      {/* 3D hero — the live connectome */}
      <section className="relative h-[100svh] min-h-[620px] w-full overflow-hidden">
        <ClientScene />
      </section>

      <Prover />
      <Sections />
    </main>
  );
}
