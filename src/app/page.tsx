import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import Services from "@/components/services";
import ResearchModes from "@/components/research-modes";
import HowItWorks from "@/components/how-it-works";
import Features from "@/components/features";
import Cta from "@/components/cta";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Services />
        <ResearchModes />
        <HowItWorks />
        <Features />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
