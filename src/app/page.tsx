import Navbar from "@/components/navbar";
import ResearchModes from "@/components/research-modes";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <ResearchModes />
      </main>
      <Footer />
    </>
  );
}
