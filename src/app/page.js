import React, { Suspense } from "react";

import Loading from "./loading"; // Import the loading component
import Experience from "@/components/Experience";

const Page = () => {
  return (
    <>
      <div className="w-full h-screen fixed bg-black">
        <Suspense fallback={<Loading />}>
          <Experience />
        </Suspense>
      </div>
    </>
  );
};

export default Page;
