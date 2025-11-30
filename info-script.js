// PPT 슬라이드 기능 (프리뷰 방식)
let currentSlideIndex = 0;
const totalSlides = 5;

function updateSlideClasses() {
  const slides = document.querySelectorAll(".ppt-slide");
  const indicators = document.querySelectorAll(".ppt-indicator");

  // 이전 슬라이드 인덱스 계산 (순환)
  const prevIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
  // 다음 슬라이드 인덱스 계산 (순환)
  const nextIndex = (currentSlideIndex + 1) % totalSlides;

  slides.forEach((slide, index) => {
    slide.classList.remove("active", "prev-slide", "next-slide");

    if (index === currentSlideIndex) {
      // 현재 슬라이드
      slide.classList.add("active");
    } else if (index === prevIndex) {
      // 이전 슬라이드 (순환)
      slide.classList.add("prev-slide");
    } else if (index === nextIndex) {
      // 다음 슬라이드 (순환)
      slide.classList.add("next-slide");
    }
  });

  indicators.forEach((indicator, index) => {
    indicator.classList.toggle("active", index === currentSlideIndex);
  });
}

function changeSlide(direction) {
  currentSlideIndex += direction;

  // 경계 처리 (순환)
  if (currentSlideIndex >= totalSlides) {
    currentSlideIndex = 0;
  } else if (currentSlideIndex < 0) {
    currentSlideIndex = totalSlides - 1;
  }

  updateSlideClasses();
}

function currentSlide(slideNumber) {
  currentSlideIndex = slideNumber - 1;
  updateSlideClasses();
}

// 자동 슬라이드 기능 (선택사항)
function startAutoSlide() {
  setInterval(() => {
    changeSlide(1);
  }, 5000); // 5초마다 자동으로 다음 슬라이드로 이동
}

// Info page animations
function initInfoAnimations() {
  const back4InfoSection = document.getElementById("back4-info-section");

  if (!back4InfoSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // back4-info-section이 보이면 eyefile 이미지들을 순차적으로 표시
          showEyeFileImages();
        }
      });
    },
    {
      threshold: 0.3,
    }
  );

  observer.observe(back4InfoSection);
}

function showEyeFileImages() {
  // eyefile1.png 먼저 표시
  setTimeout(() => {
    const eyefile1 = document.querySelector(".eyefile1-img");
    if (eyefile1) eyefile1.classList.add("show");
  }, 1000);

  // eyefile2.png 표시
  setTimeout(() => {
    const eyefile2 = document.querySelector(".eyefile2-img");
    if (eyefile2) eyefile2.classList.add("show");
  }, 1500);

  // eyefile3.png 표시
  setTimeout(() => {
    const eyefile3 = document.querySelector(".eyefile3-img");
    if (eyefile3) eyefile3.classList.add("show");
  }, 2000);

  // red.png와 red2.png 표시 (eyefile3 이후)
  setTimeout(() => {
    const red = document.querySelector(".red-img");
    const red2 = document.querySelector(".red2-img");
    if (red) red.classList.add("show");
    if (red2) red2.classList.add("show");
  }, 3000);
}

// Ida 모달 표시
function showIda() {
  const modal = document.getElementById("ida-modal-overlay");
  if (modal) {
    modal.classList.add("show");
  }
}

// Ida 모달 숨기기
function hideIda() {
  const modal = document.getElementById("ida-modal-overlay");
  const voice1Audio = document.getElementById("voice1-audio");
  if (modal) {
    modal.classList.remove("show");
  }
  // 모달 닫힐 때 오디오 정지 및 리셋
  if (voice1Audio) {
    voice1Audio.pause();
    voice1Audio.currentTime = 0;
  }
}

// Profile2 모달 표시
function showProfile2() {
  const modal = document.getElementById("profile2-modal-overlay");
  if (modal) {
    modal.classList.add("show");
  }
}

// Profile2 모달 숨기기
function hideProfile2() {
  const modal = document.getElementById("profile2-modal-overlay");
  const voice2Audio = document.getElementById("voice2-audio");
  if (modal) {
    modal.classList.remove("show");
  }
  if (voice2Audio) {
    voice2Audio.pause();
    voice2Audio.currentTime = 0;
  }
}

// Profile3 모달 표시
function showProfile3() {
  const modal = document.getElementById("profile3-modal-overlay");
  if (modal) {
    modal.classList.add("show");
  }
}

// Profile3 모달 숨기기
function hideProfile3() {
  const modal = document.getElementById("profile3-modal-overlay");
  const voice3Audio = document.getElementById("voice3-audio");
  if (modal) {
    modal.classList.remove("show");
  }
  if (voice3Audio) {
    voice3Audio.pause();
    voice3Audio.currentTime = 0;
  }
}

// File overlay functions
function showOverlay(imageType) {
  const fileOverlay = document.getElementById("file-overlay");
  const fileContent = document.querySelector(".file-content");
  const allOverlayImages = document.querySelectorAll(".overlay-img");

  if (fileOverlay && fileContent) {
    // 모든 오버레이 이미지 숨기기
    allOverlayImages.forEach((img) => {
      img.classList.remove("show");
    });

    // 오버레이와 블러 효과 표시
    fileOverlay.classList.add("show");
    fileContent.classList.add("blur");

    // 이전 이미지가 완전히 사라진 후 새로운 이미지 표시
    setTimeout(() => {
      const targetImage = document.getElementById(imageType + "-img");
      if (targetImage) {
        targetImage.classList.add("show");
      }
    }, 400); // 0.4초 지연 (transition 시간의 절반)
  }
}

// PPT 이미지 애니메이션 초기화 (index.html의 initChangAnimation과 유사한 패턴)
function initPPTImageAnimations() {
  const pptImages = document.querySelectorAll(".ppt-image");

  if (pptImages.length === 0) return;

  pptImages.forEach((img) => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 화면에 보이면 애니메이션 실행
            setTimeout(() => {
              entry.target.classList.add("animate");
            }, 200); // 0.2초 지연
          } else {
            // 화면에서 벗어나면 애니메이션 초기화
            entry.target.classList.remove("animate");
          }
        });
      },
      {
        threshold: 0.3, // 30% 보일 때 트리거
        rootMargin: "0px 0px -100px 0px", // 아래쪽 100px 여유
      }
    );

    observer.observe(img);
  });
}

// 페이지 로드 시 애니메이션 초기화
document.addEventListener("DOMContentLoaded", function () {
  initInfoAnimations();
  initPPTImageAnimations(); // PPT 이미지 애니메이션 추가

  // 자동 슬라이드 시작 (원하는 경우 주석 해제)
  // startAutoSlide();

  // 오버레이 이미지 클릭 시 오버레이 숨기기
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("overlay-img")) {
      const fileOverlay = document.getElementById("file-overlay");
      const fileContent = document.querySelector(".file-content");
      const allOverlayImages = document.querySelectorAll(".overlay-img");

      if (fileOverlay && fileContent) {
        // 모든 오버레이 이미지 숨기기
        allOverlayImages.forEach((img) => {
          img.classList.remove("show");
        });

        // 오버레이와 블러 효과 숨기기
        fileOverlay.classList.remove("show");
        fileContent.classList.remove("blur");
      }
    }
  });

  // 오버레이 배경 클릭 시 오버레이 숨기기
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("file-overlay")) {
      const fileOverlay = document.getElementById("file-overlay");
      const fileContent = document.querySelector(".file-content");
      const allOverlayImages = document.querySelectorAll(".overlay-img");

      if (fileOverlay && fileContent) {
        // 모든 오버레이 이미지 숨기기
        allOverlayImages.forEach((img) => {
          img.classList.remove("show");
        });

        // 오버레이와 블러 효과 숨기기
        fileOverlay.classList.remove("show");
        fileContent.classList.remove("blur");
      }
    }
  });

  // voice1.png 클릭 시 voice1.mp4 오디오만 재생/일시정지
  const voice1Img = document.getElementById("voice1-img");
  const voice1Audio = document.getElementById("voice1-audio");
  const voice2Img = document.getElementById("voice2-img");
  const voice2Audio = document.getElementById("voice2-audio");
  const voice3Img = document.getElementById("voice3-img");
  const voice3Audio = document.getElementById("voice3-audio");

  function pauseOthers(except) {
    [voice1Audio, voice2Audio, voice3Audio].forEach((aud) => {
      if (aud && aud !== except) {
        aud.pause();
        aud.currentTime = 0;
      }
    });
  }

  if (voice1Img && voice1Audio) {
    voice1Img.addEventListener("click", () => {
      if (voice1Audio.paused) {
        pauseOthers(voice1Audio);
        voice1Audio.currentTime = 0;
        voice1Audio.play().catch(() => {});
      } else {
        voice1Audio.pause();
        voice1Audio.currentTime = 0;
      }
    });
  }

  if (voice2Img && voice2Audio) {
    voice2Img.addEventListener("click", () => {
      if (voice2Audio.paused) {
        pauseOthers(voice2Audio);
        voice2Audio.currentTime = 0;
        voice2Audio.play().catch(() => {});
      } else {
        voice2Audio.pause();
        voice2Audio.currentTime = 0;
      }
    });
  }

  if (voice3Img && voice3Audio) {
    voice3Img.addEventListener("click", () => {
      if (voice3Audio.paused) {
        pauseOthers(voice3Audio);
        voice3Audio.currentTime = 0;
        voice3Audio.play().catch(() => {});
      } else {
        voice3Audio.pause();
        voice3Audio.currentTime = 0;
      }
    });
  }
});
