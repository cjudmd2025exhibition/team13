// 타이핑 효과 함수
function typeText(input, text) {
  if (input.value !== "") return; // 이미 텍스트가 있으면 실행하지 않음

  // 기존 타이핑이 진행 중이면 중단
  if (input.isTyping) return;

  input.isTyping = true;
  input.value = "";
  let index = 0;

  const typeInterval = setInterval(() => {
    if (index < text.length) {
      input.value += text[index];
      index++;
    } else {
      clearInterval(typeInterval);
      input.isTyping = false;
    }
  }, 100); // 100ms마다 한 글자씩
}

// 전역 Lenis 인스턴스
let lenis = null;

document.addEventListener("DOMContentLoaded", () => {
  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis();
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  const animateOnScroll = true;

  // 촘촘히 쌓이도록 물리 설정 조정
  const config = {
    gravity: { x: 0, y: 2.5 }, // 중력 증가 (더 빠르게 떨어짐)
    restitution: 0.08, // 튕김 더 줄이기 (구석으로 밀려나는 것 방지)
    friction: 0.8, // 마찰 더 늘리기 (벽에 붙어서 구석으로 가지 않도록)
    frictionAir: 0.05, // 공기저항 증가 (속도 제어)
    density: 0.003, // 조금 무겁게
    wallThickness: 200,
    mouseStiffness: 1.0, // 마우스 그랩 강도 최대
  };

  // 각 컨테이너마다 독립적인 물리 엔진 관리
  const physicsInstances = new Map(); // container -> { engine, runner, mouseConstraint, bodies, topWall, dragging, originalInertia }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function createObjects(container, images) {
    return new Promise((resolve) => {
      const elements = [];
      let loadedCount = 0;
      const totalImages = images.length;
      const loadStatus = new Array(totalImages).fill(false);

      if (totalImages === 0) {
        resolve(elements);
        return;
      }

      const checkAllLoaded = () => {
        if (loadedCount === totalImages) {
          // 모든 이미지가 로드되었는지 최종 확인
          const notLoaded = [];
          loadStatus.forEach((loaded, idx) => {
            if (!loaded) {
              notLoaded.push(images[idx]);
            }
          });
          
          if (notLoaded.length > 0) {
            console.warn(`⚠️ 로드되지 않은 이미지: ${notLoaded.length}개`, notLoaded);
          }
          
          // DOM에 추가된 요소 수 확인
          const domElements = container.querySelectorAll(".object");
          if (domElements.length !== totalImages) {
            console.warn(`⚠️ DOM 요소 수 불일치: ${domElements.length}개 있음, ${totalImages}개 예상`);
          }
          
          setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve(elements);
              });
            });
          }, 200);
        }
      };

      images.forEach((src, index) => {
        const el = document.createElement("div");
        el.className = "object";
        container.appendChild(el);
        elements.push(el);

        // 이미지 프리로드하여 로드 완료 확인
        const img = new Image();
        
        // 타임아웃 설정 (5초)
        const timeout = setTimeout(() => {
          if (!loadStatus[index]) {
            console.warn(`⏱️ 이미지 로드 타임아웃: ${src}`);
            el.style.backgroundImage = `url('${src}')`;
            void el.offsetWidth;
            loadStatus[index] = true;
            loadedCount++;
            checkAllLoaded();
          }
        }, 5000);
        
        img.onload = () => {
          clearTimeout(timeout);
          if (!loadStatus[index]) {
            el.style.backgroundImage = `url('${src}')`;
            void el.offsetWidth;
            loadStatus[index] = true;
            loadedCount++;
            checkAllLoaded();
          }
        };
        img.onerror = () => {
          clearTimeout(timeout);
          if (!loadStatus[index]) {
            console.warn(`❌ 이미지 로드 실패: ${src}`);
            el.style.backgroundImage = `url('${src}')`;
            void el.offsetWidth;
            loadStatus[index] = true;
            loadedCount++;
            checkAllLoaded();
          }
        };
        img.src = src;
      });
    });
  }

  function initPhysics(container) {
    // 기존 인스턴스가 있으면 정리
    cleanupPhysics(container);

    // 새로운 물리 엔진 생성
    const engine = Matter.Engine.create();
    engine.world.gravity.x = config.gravity.x;
    engine.world.gravity.y = config.gravity.y;

    engine.constraintIterations = 10;
    engine.positionIterations = 20;
    engine.velocityIterations = 16;
    engine.timing.timeScale = 1.2;

    // 컨테이너의 실제 크기 사용
    const containerRect = {
      width: container.offsetWidth || container.clientWidth,
      height: container.offsetHeight || container.clientHeight
    };
    const wallThickness = config.wallThickness;

    const walls = [
      Matter.Bodies.rectangle(
        containerRect.width / 2,
        containerRect.height + wallThickness / 2,
        containerRect.width + wallThickness * 2,
        wallThickness,
        { isStatic: true }
      ),
      Matter.Bodies.rectangle(
        -wallThickness / 2,
        containerRect.height / 2,
        wallThickness,
        containerRect.height + wallThickness * 2,
        { isStatic: true }
      ),
      Matter.Bodies.rectangle(
        containerRect.width + wallThickness / 2,
        containerRect.height / 2,
        wallThickness,
        containerRect.height + wallThickness * 2,
        { isStatic: true }
      ),
    ];
    Matter.World.add(engine.world, walls);

    const objects = container.querySelectorAll(".object");
    const COLLISION_SCALE = 0.75; // 충돌 박스 축소(간격 줄이기)
    const center = containerRect.width / 2;
    const spread = containerRect.width * 0.6; // 스폰 범위 조정 (너무 넓지 않게)

    const bodies = [];

    console.log(`🔧 물리 엔진 초기화 시작: ${objects.length}개 객체 발견`);
    
    if (objects.length === 0) {
      console.error(`❌ 객체가 없습니다!`);
      return;
    }
    
    if (objects.length !== 60) {
      console.warn(`⚠️ 예상과 다른 객체 수: ${objects.length}개 (60개 예상)`);
    }

    objects.forEach((obj, index) => {
      // 객체의 실제 크기 사용 (이미지가 로드된 후이므로 정확한 크기)
      let objWidth = obj.offsetWidth;
      let objHeight = obj.offsetHeight;
      
      // 크기가 0이거나 없으면 기본값 사용
      if (!objWidth || objWidth === 0) {
        objWidth = 144;
      }
      if (!objHeight || objHeight === 0) {
        objHeight = 144;
      }

      const startX = center + (Math.random() - 0.5) * spread;
      // 초기 위치를 더 가깝게 배치 (화면 상단 근처에서 시작)
      // 처음 38개는 화면 안에서 시작하고, 나머지는 위에서 떨어지도록
      const startY = index < 38 ? 50 + index * 17 : -15 - (index - 38) * 7;
      const startRotation = (Math.random() - 0.5) * Math.PI;

      const bodyW = objWidth * COLLISION_SCALE;
      const bodyH = objHeight * COLLISION_SCALE;

      const body = Matter.Bodies.rectangle(startX, startY, bodyW, bodyH, {
        restitution: config.restitution,
        friction: config.friction,
        frictionAir: config.frictionAir,
        density: config.density,
        chamfer: { radius: Math.min(bodyW, bodyH) * 0.12 },
      });

      Matter.Body.setAngle(body, startRotation);
      
      // 초기 속도 추가 (떨어지도록, 위에 있는 이미지는 더 빠르게)
      const initialVelocity = startY < 0 ? {
        x: (Math.random() - 0.5) * 5,
        y: Math.random() * 5 + 4
      } : {
        x: (Math.random() - 0.5) * 1,
        y: Math.random() * 1 + 0.5
      };
      Matter.Body.setVelocity(body, initialVelocity);

      bodies.push({
        body,
        element: obj,
        width: objWidth,
        height: objHeight,
      });

      Matter.World.add(engine.world, body);
    });
    
    // 모든 객체가 물리 엔진에 추가되었는지 확인
    console.log(`✅ 물리 엔진 초기화 완료: ${bodies.length}개 body 생성됨 (${objects.length}개 객체)`);
    
    if (bodies.length !== objects.length) {
      console.error(`❌ 물리 엔진 불일치: ${bodies.length}개 body 생성됨, ${objects.length}개 객체 있음`);
    }
    
    if (bodies.length !== 60) {
      console.error(`❌ 예상과 다른 body 수: ${bodies.length}개 (60개 예상)`);
    }

    // topWall을 더 빨리 생성하여 이미지들이 위로 빠져나가지 않도록
    let topWall = null;
    const topWallTimeout = setTimeout(() => {
      topWall = Matter.Bodies.rectangle(
        containerRect.width / 2,
        -wallThickness / 2,
        containerRect.width + wallThickness * 2,
        wallThickness,
        { isStatic: true }
      );
      Matter.World.add(engine.world, topWall);
      // 인스턴스에 topWall 저장
      const instance = physicsInstances.get(container);
      if (instance) {
        instance.topWall = topWall;
      }
    }, 1000); // 3초에서 1초로 단축

    // 마우스 생성 - 컨테이너 또는 렌더 캔버스 사용
    const mouse = Matter.Mouse.create(container);
    if (mouse.mousewheel) {
      mouse.element.removeEventListener("mousewheel", mouse.mousewheel);
      mouse.element.removeEventListener("DOMMouseScroll", mouse.mousewheel);
    }

    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: config.mouseStiffness,
        render: { visible: false },
      },
    });

    mouseConstraint.mouse.element.oncontextmenu = () => false;
    
    // 터치 이벤트 지원 추가 (Mac 터치패드/터치스크린)
    const touchEvents = ['touchstart', 'touchmove', 'touchend'];
    touchEvents.forEach(eventType => {
      container.addEventListener(eventType, (e) => {
        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const mouseEvent = new MouseEvent(eventType.replace('touch', 'mouse'), {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true
          });
          container.dispatchEvent(mouseEvent);
        }
      }, { passive: false });
    });

    let dragging = null,
      originalInertia = null;

    Matter.Events.on(mouseConstraint, "startdrag", (event) => {
      const instance = physicsInstances.get(container);
      if (!instance || instance.isDragging) return; // 이미 드래그 중이면 무시
      
      dragging = event.body;
      if (dragging) {
        instance.isDragging = true;
        originalInertia = dragging.inertia;
        Matter.Body.setInertia(dragging, Infinity);
        Matter.Body.setVelocity(dragging, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(dragging, 0);
        // 인스턴스에 dragging 상태 저장
        instance.dragging = dragging;
        instance.originalInertia = originalInertia;
      }
    });

    Matter.Events.on(mouseConstraint, "enddrag", () => {
      const instance = physicsInstances.get(container);
      if (!instance || !instance.isDragging) return; // 드래그 중이 아니면 무시
      
      if (dragging) {
        instance.isDragging = false;
        Matter.Body.setInertia(dragging, originalInertia || 1);
        dragging = null;
        originalInertia = null;
        // 인스턴스에서 dragging 상태 제거
        instance.dragging = null;
        instance.originalInertia = null;
      }
    });

    Matter.Events.on(engine, "beforeUpdate", () => {
      const instance = physicsInstances.get(container);
      const currentDragging = instance ? instance.dragging : dragging;
      if (currentDragging) {
        const found = bodies.find((b) => b.body === currentDragging);
        if (found) {
          const minX = found.width / 2;
          const maxX = containerRect.width - found.width / 2;
          const minY = found.height / 2;
          const maxY = containerRect.height - found.height / 2;

          Matter.Body.setPosition(currentDragging, {
            x: clamp(currentDragging.position.x, minX, maxX),
            y: clamp(currentDragging.position.y, minY, maxY),
          });

          Matter.Body.setVelocity(currentDragging, {
            x: clamp(currentDragging.velocity.x, -20, 20),
            y: clamp(currentDragging.velocity.y, -20, 20),
          });
        }
      }
    });

    const handleMouseLeave = () => {
      const instance = physicsInstances.get(container);
      if (instance && instance.isDragging) {
        instance.isDragging = false;
        if (instance.dragging) {
          Matter.Body.setInertia(instance.dragging, instance.originalInertia || 1);
          instance.dragging = null;
          instance.originalInertia = null;
        }
      }
      mouseConstraint.constraint.bodyB = null;
      mouseConstraint.constraint.pointB = null;
    };
    container.addEventListener("mouseleave", handleMouseLeave);
    
    const handleMouseUp = () => {
      const instance = physicsInstances.get(container);
      if (instance && instance.isDragging) {
        instance.isDragging = false;
        if (instance.dragging) {
          Matter.Body.setInertia(instance.dragging, instance.originalInertia || 1);
          instance.dragging = null;
          instance.originalInertia = null;
        }
      }
      mouseConstraint.constraint.bodyB = null;
      mouseConstraint.constraint.pointB = null;
    };
    document.addEventListener("mouseup", handleMouseUp);
    
    // 터치 이벤트도 처리
    const handleTouchEnd = () => {
      const instance = physicsInstances.get(container);
      if (instance && instance.isDragging) {
        instance.isDragging = false;
        if (instance.dragging) {
          Matter.Body.setInertia(instance.dragging, instance.originalInertia || 1);
          instance.dragging = null;
          instance.originalInertia = null;
        }
      }
      mouseConstraint.constraint.bodyB = null;
      mouseConstraint.constraint.pointB = null;
    };
    document.addEventListener("touchend", handleTouchEnd);

    Matter.World.add(engine.world, mouseConstraint);

    const runner = Matter.Runner.create();
    runner.delta = 1000 / 60; // 60fps로 고정
    runner.isFixed = true; // 고정 프레임레이트
    Matter.Runner.run(runner, engine);

    // 인스턴스 정보 저장
    const instance = {
      engine,
      runner,
      mouseConstraint,
      bodies,
      topWall: null, // 나중에 설정됨
      dragging: null,
      originalInertia: null,
      isDragging: false,
      topWallTimeout,
      handleMouseLeave,
      handleMouseUp,
      handleTouchEnd,
      updateLoop: null
    };
    physicsInstances.set(container, instance);

    // 위치 업데이트 루프
    instance.containerRect = containerRect;
    
    const updatePositions = () => {
      const currentInstance = physicsInstances.get(container);
      if (!currentInstance) return;
      
      const rect = currentInstance.containerRect;
      let visibleCount = 0;
      let offScreenCount = 0;
      
      currentInstance.bodies.forEach(({ body, element, width, height }, index) => {
        const x = clamp(
          body.position.x - width / 2,
          0,
          rect.width - width
        );
        const y = clamp(
          body.position.y - height / 2,
          -height * 5,
          rect.height - height
        );
        
        // 화면 내에 있는지 확인
        const isVisible = y >= -height * 2 && y <= rect.height && x >= 0 && x <= rect.width - width;
        if (isVisible) {
          visibleCount++;
        } else {
          offScreenCount++;
        }
        
        element.style.left = x + "px";
        element.style.top = y + "px";
        element.style.transform = `rotate(${body.angle}rad)`;
        element.style.visibility = isVisible ? "visible" : "visible"; // 항상 visible로 설정
        element.style.opacity = "1"; // opacity 확실히 설정
      });
      
      // 첫 프레임에서만 로그 출력
      if (!currentInstance.positionLogged) {
        console.log(`📍 위치 업데이트: 화면 내 ${visibleCount}개, 화면 밖 ${offScreenCount}개`);
        currentInstance.positionLogged = true;
      }
      
      currentInstance.updateLoop = requestAnimationFrame(updatePositions);
    };
    instance.updateLoop = requestAnimationFrame(updatePositions);
  }

  // 물리 엔진 정리 함수
  function cleanupPhysics(container) {
    const instance = physicsInstances.get(container);
    if (!instance) return;

    // 타이머 정리
    if (instance.topWallTimeout) {
      clearTimeout(instance.topWallTimeout);
    }

    // 애니메이션 루프 정리
    if (instance.updateLoop) {
      cancelAnimationFrame(instance.updateLoop);
    }

    // 이벤트 리스너 제거
    if (instance.handleMouseLeave) {
      container.removeEventListener("mouseleave", instance.handleMouseLeave);
    }
    if (instance.handleMouseUp) {
      document.removeEventListener("mouseup", instance.handleMouseUp);
    }
    if (instance.handleTouchEnd) {
      document.removeEventListener("touchend", instance.handleTouchEnd);
    }

    // Matter.js 리소스 정리
    if (instance.runner) {
      Matter.Runner.stop(instance.runner);
    }
    if (instance.engine) {
      Matter.Engine.clear(instance.engine);
      Matter.World.clear(instance.engine.world);
    }

    // Map에서 제거
    physicsInstances.delete(container);
  }

  async function start(container) {
    // 기존 물리 엔진 정리
    cleanupPhysics(container);
    
    // 기존 객체들 제거
    const existingObjects = container.querySelectorAll(".object");
    existingObjects.forEach((obj) => obj.remove());

    // ./image/chat1.png ~ ./image/chat60.png
    const images = Array.from(
      { length: 60 },
      (_, i) => `./image/chat${i + 1}.png`
    );
    
    // 모든 이미지가 로드될 때까지 기다린 후 물리 엔진 초기화
    const elements = await createObjects(container, images);
    
    // 최종 확인: DOM에 추가된 객체 수
    const domObjects = container.querySelectorAll(".object");
    console.log(`✅ 이미지 생성 완료: ${elements.length}개 요소, ${domObjects.length}개 DOM 객체`);
    
    if (domObjects.length !== 60) {
      console.warn(`⚠️ DOM 객체 수 불일치: ${domObjects.length}개 있음, 60개 예상`);
    }
    
    // 추가 대기 시간 (이미지 렌더링 완료 보장)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    initPhysics(container);
  }

  // Google 섹션 애니메이션
  const googleSection = document.querySelector("#google-section");
  if (googleSection) {
    ScrollTrigger.create({
      trigger: googleSection,
      start: "top 80%",
      end: "bottom 20%",
      once: false,
      onEnter: () => {
        const googleImg = googleSection.querySelector(".google-img");
        const searchContainer = googleSection.querySelector(
          ".google-search-container"
        );
        const searchInput = googleSection.querySelector(".google-search-input");

        if (googleImg) {
          googleImg.classList.add("animate");
        }
        if (searchContainer) {
          searchContainer.classList.add("animate");
        }
        // 포커스를 주어 네이티브 캐럿(커서) 깜빡임을 표시
        // 자동 입력 방지: 캐럿만 보이도록 자동 포커스는 제거
      },
      onLeave: () => {
        const googleImg = googleSection.querySelector(".google-img");
        const searchContainer = googleSection.querySelector(
          ".google-search-container"
        );
        const searchInput = googleSection.querySelector(".google-search-input");

        if (googleImg) {
          googleImg.classList.remove("animate");
        }
        if (searchContainer) {
          searchContainer.classList.remove("animate");
        }
        // 섹션을 떠날 때의 별도 처리 없음
      },
      onEnterBack: () => {
        const googleImg = googleSection.querySelector(".google-img");
        const searchContainer = googleSection.querySelector(
          ".google-search-container"
        );
        const searchInput = googleSection.querySelector(".google-search-input");

        if (googleImg) {
          googleImg.classList.add("animate");
        }
        if (searchContainer) {
          searchContainer.classList.add("animate");
        }
        // 자동 포커스 없이 캐럿 유도만 유지
      },
      onLeaveBack: () => {
        const googleImg = googleSection.querySelector(".google-img");
        const searchContainer = googleSection.querySelector(
          ".google-search-container"
        );
        const searchInput = googleSection.querySelector(".google-search-input");

        if (googleImg) {
          googleImg.classList.remove("animate");
        }
        if (searchContainer) {
          searchContainer.classList.remove("animate");
        }
        // 자동 blur 제거
      },
    });
  }

  // Chatgroup 섹션 애니메이션
  const chatgroupSection = document.querySelector("#chatgroup-section");
  let chatgroupTimers = [];

  function clearChatgroupTimers() {
    chatgroupTimers.forEach((timer) => clearTimeout(timer));
    chatgroupTimers = [];
  }

  if (chatgroupSection) {
    ScrollTrigger.create({
      trigger: chatgroupSection,
      start: "top 80%",
      end: "bottom 20%",
      once: false,
      onEnter: () => {
        clearChatgroupTimers();
        const chatgroupImg = chatgroupSection.querySelector(".chatgroup-img");
        const arrowDown = chatgroupSection.querySelector(".arrow-down");
        const dangerImgs = chatgroupSection.querySelectorAll(".danger-img");

        // danger 이미지들이 먼저 나타나도록 (0.3초 지연)
        dangerImgs.forEach((img, index) => {
          const timer = setTimeout(() => {
            img.classList.add("animate");
          }, 300 + index * 150); // 각각 0.15초씩 지연
          chatgroupTimers.push(timer);
        });

        // chatgroup 이미지가 나중에 나타나도록 (1.5초 지연)
        const timer = setTimeout(() => {
          if (chatgroupImg) {
            chatgroupImg.classList.add("animate");
          }
        }, 1500);
        chatgroupTimers.push(timer);

        if (arrowDown) {
          arrowDown.style.opacity = "1";
        }
      },
      onLeave: () => {
        clearChatgroupTimers();
        const chatgroupImg = chatgroupSection.querySelector(".chatgroup-img");
        const arrowDown = chatgroupSection.querySelector(".arrow-down");
        const dangerImgs = chatgroupSection.querySelectorAll(".danger-img");

        if (chatgroupImg) {
          chatgroupImg.classList.remove("animate");
        }
        if (arrowDown) {
          arrowDown.style.opacity = "0";
        }
        dangerImgs.forEach((img) => {
          img.classList.remove("animate");
        });
      },
      onEnterBack: () => {
        clearChatgroupTimers();
        const chatgroupImg = chatgroupSection.querySelector(".chatgroup-img");
        const arrowDown = chatgroupSection.querySelector(".arrow-down");
        const dangerImgs = chatgroupSection.querySelectorAll(".danger-img");

        // danger 이미지들이 먼저 나타나도록
        dangerImgs.forEach((img, index) => {
          const timer = setTimeout(() => {
            img.classList.add("animate");
          }, 300 + index * 150);
          chatgroupTimers.push(timer);
        });

        // chatgroup 이미지가 나중에 나타나도록
        const timer = setTimeout(() => {
          if (chatgroupImg) {
            chatgroupImg.classList.add("animate");
          }
        }, 1500);
        chatgroupTimers.push(timer);

        if (arrowDown) {
          arrowDown.style.opacity = "1";
        }
      },
      onLeaveBack: () => {
        clearChatgroupTimers();
        const chatgroupImg = chatgroupSection.querySelector(".chatgroup-img");
        const arrowDown = chatgroupSection.querySelector(".arrow-down");
        const dangerImgs = chatgroupSection.querySelectorAll(".danger-img");

        if (chatgroupImg) {
          chatgroupImg.classList.remove("animate");
        }
        if (arrowDown) {
          arrowDown.style.opacity = "0";
        }
        dangerImgs.forEach((img) => {
          img.classList.remove("animate");
        });
      },
    });
  }

  // Back4 섹션에서 mark2 깜빡임 시작 (1초 지연 후 표시)
  let flickerTimer = null;
  let remainingFlickers = 0;
  const back4Section = document.querySelector("#back4-section");
  if (back4Section) {
    ScrollTrigger.create({
      trigger: back4Section,
      start: "top 80%",
      end: "bottom 20%",
      once: false,
      onEnter: () => startRandomFlicker(),
      onLeave: () => stopRandomFlicker(),
      onEnterBack: () => startRandomFlicker(),
      onLeaveBack: () => stopRandomFlicker(),
    });
  }

  function startRandomFlicker() {
    const mark2 = back4Section?.querySelector(".beat2-img");
    if (!mark2) return;
    mark2.style.visibility = "visible";
    mark2.style.opacity = "0";
    // 무작위 정전 느낌: 몇 번 깜빡인 뒤 상시 켜짐
    remainingFlickers = 3 + Math.floor(Math.random() * 4); // 3~6회
    const runCycle = () => {
      if (!mark2) return;
      const onDuration = 120 + Math.random() * 220; // 120~340ms 켬
      const offDuration = 80 + Math.random() * 260; // 80~340ms 끔
      mark2.style.opacity = "1";
      setTimeout(() => {
        remainingFlickers -= 1;
        if (remainingFlickers > 0) {
          mark2.style.opacity = "0";
          flickerTimer = setTimeout(runCycle, offDuration);
        } else {
          // 마지막에는 켜진 상태로 유지
          mark2.style.opacity = "1";
          if (flickerTimer) {
            clearTimeout(flickerTimer);
            flickerTimer = null;
          }
        }
      }, onDuration);
    };
    // 1초 지연 후 시작
    flickerTimer = setTimeout(runCycle, 1000);
  }

  function stopRandomFlicker() {
    const mark2 = back4Section?.querySelector(".beat2-img");
    if (flickerTimer) {
      clearTimeout(flickerTimer);
      flickerTimer = null;
    }
    remainingFlickers = 0;
    if (mark2) {
      mark2.style.opacity = "0";
      mark2.style.visibility = "hidden";
    }
  }

  if (animateOnScroll) {
    document.querySelectorAll("section").forEach((section) => {
      if (section.querySelector(".object-container")) {
        ScrollTrigger.create({
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          once: false,
          onEnter: () => {
            const container = section.querySelector(".object-container");
            if (container) {
              start(container);
            }
          },
          onLeave: () => {
            // 섹션을 벗어나면 물리 엔진 정리
            const container = section.querySelector(".object-container");
            if (container) {
              cleanupPhysics(container);
            }
          },
          onEnterBack: () => {
            const container = section.querySelector(".object-container");
            if (container) {
              start(container);
            }
          },
          onLeaveBack: () => {
            // 섹션을 벗어나면 물리 엔진 정리
            const container = section.querySelector(".object-container");
            if (container) {
              cleanupPhysics(container);
            }
          },
        });
      }
    });
  } else {
    const container = document.querySelector(".object-container");
    if (container) start(container);
  }
});

// Toggle tag image visibility
function toggleTag() {
  const tagImg = document.getElementById("tag-img");
  if (tagImg) {
    tagImg.classList.toggle("show");
  }
}

// Body 이미지들 클릭으로 사라지게 하는 기능
function toggleImage(element) {
  element.style.opacity = "0";
  element.style.pointerEvents = "none";

  // 모든 body 이미지가 사라졌는지 체크
  checkAllBodyImagesHidden();
}

// 모든 body 이미지가 사라졌는지 체크하는 함수
function checkAllBodyImagesHidden() {
  const bodyImages = [
    ".shoulder1-img",
    ".shoulder2-img",
    ".shoulder3-img",
    ".stomac1-img",
    ".stomac2-img",
    ".leg1-img",
    ".leg2-img",
    ".leg3-img",
  ];

  let allHidden = true;
  bodyImages.forEach((selector) => {
    const img = document.querySelector(selector);
    if (img && img.style.opacity !== "0") {
      allHidden = false;
    }
  });

  // 모든 이미지가 사라졌으면 텍스트들도 숨기기
  if (allHidden) {
    hideBodyRandomTexts();
    // 모든 이미지가 사라졌으므로 스크롤 잠금 해제
    unlockBodyScroll();
  }
}

// Body 섹션 관련 변수
let bodySectionObserver;
let bodySectionEntered = false;
let bodyScrollLocked = false;

// 경고 메시지 표시 함수
function showBodyScrollWarning() {
  // 이미 메시지가 있으면 중복 표시 방지
  let warningMessage = document.getElementById("body-scroll-warning");

  if (!warningMessage) {
    // 경고 메시지 생성
    warningMessage = document.createElement("div");
    warningMessage.id = "body-scroll-warning";
    warningMessage.textContent =
      "모든 창을 꺼주세요. 그래야 넘어갈 수 있습니다.";
    document.body.appendChild(warningMessage);

    // 애니메이션 추가 (페이드인 후 페이드아웃)
    setTimeout(() => {
      if (warningMessage) {
        warningMessage.classList.add("show");
      }
    }, 10);

    // 2초 후 제거
    setTimeout(() => {
      if (warningMessage) {
        warningMessage.classList.remove("show");
        setTimeout(() => {
          if (warningMessage && warningMessage.parentNode) {
            warningMessage.parentNode.removeChild(warningMessage);
          }
        }, 300); // 페이드아웃 시간
      }
    }, 2000);
  }
}

// 모든 body 이미지가 열려있는지 확인
function areAllBodyImagesVisible() {
  const bodyImages = [
    ".shoulder1-img",
    ".shoulder2-img",
    ".shoulder3-img",
    ".stomac1-img",
    ".stomac2-img",
    ".leg1-img",
    ".leg2-img",
    ".leg3-img",
  ];

  let hasVisibleImage = false;
  bodyImages.forEach((selector) => {
    const img = document.querySelector(selector);
    if (img && img.style.opacity !== "0") {
      hasVisibleImage = true;
    }
  });

  return hasVisibleImage;
}

// Body 섹션 스크롤 감지 및 경고 메시지 표시
function lockBodyScroll() {
  if (bodyScrollLocked) return;

  bodyScrollLocked = true;

  // 스크롤 이벤트 감지하여 경고 메시지 표시
  window.addEventListener("wheel", handleBodyScrollAttempt, { passive: false });
  window.addEventListener("touchmove", handleBodyScrollAttempt, {
    passive: false,
  });
  window.addEventListener("keydown", handleBodyScrollKeyboard);
}

// Body 섹션 스크롤 잠금 해제
function unlockBodyScroll() {
  if (!bodyScrollLocked) return;

  bodyScrollLocked = false;

  // 스크롤 이벤트 핸들러 제거
  window.removeEventListener("wheel", handleBodyScrollAttempt);
  window.removeEventListener("touchmove", handleBodyScrollAttempt);
  window.removeEventListener("keydown", handleBodyScrollKeyboard);
}

// 스크롤 시도 시 처리 함수
function handleBodyScrollAttempt(e) {
  if (!bodyScrollLocked) return;

  const bodySection = document.getElementById("body-section");
  if (!bodySection) return;

  const rect = bodySection.getBoundingClientRect();
  const isInBodySection = rect.top <= window.innerHeight && rect.bottom >= 0;

  // body 섹션이 보이고 아직 열려있는 이미지가 있으면
  if (isInBodySection && areAllBodyImagesVisible()) {
    // 아래로 스크롤하려는 시도만 체크
    let isScrollingDown = false;

    if (e.type === "wheel") {
      isScrollingDown = e.deltaY > 0;
    } else if (e.type === "touchmove") {
      // 터치 시작 위치와 현재 위치 비교
      const touch = e.touches[0];
      isScrollingDown = touch.clientY > window.innerHeight / 2;
    }

    if (isScrollingDown) {
      e.preventDefault();
      e.stopPropagation();

      // 경고 메시지 표시
      showBodyScrollWarning();

      return false;
    }
  }
}

// 키보드 스크롤 시도 처리
function handleBodyScrollKeyboard(e) {
  if (!bodyScrollLocked) return;

  const scrollKeys = [32, 33, 34, 40]; // Space, Page Down, End, Down Arrow
  if (scrollKeys.includes(e.keyCode)) {
    const bodySection = document.getElementById("body-section");
    if (!bodySection) return;

    const rect = bodySection.getBoundingClientRect();
    const isInBodySection = rect.top <= window.innerHeight && rect.bottom >= 0;

    if (isInBodySection && areAllBodyImagesVisible()) {
      e.preventDefault();
      e.stopPropagation();

      // 경고 메시지 표시
      showBodyScrollWarning();

      return false;
    }
  }
}

// 스크롤 감지하여 body 섹션에 들어올 때 이미지들 보이게 하는 기능
function initBodyImageReset() {
  const bodySection = document.getElementById("body-section");
  if (!bodySection) return;

  bodySectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !bodySectionEntered) {
          // body 섹션에 처음 진입할 때만 실행
          bodySectionEntered = true;

          // 모든 body 이미지들 보이게 하기
          const bodyImages = bodySection.querySelectorAll(
            ".shoulder1-img, .shoulder2-img, .shoulder3-img, .stomac1-img, .stomac2-img, .leg1-img, .leg2-img, .leg3-img"
          );
          bodyImages.forEach((img) => {
            img.style.opacity = "1";
            img.style.pointerEvents = "auto";
          });

          // 이미지들이 나타났으므로 텍스트들도 다시 시작
          startBodyRandomTexts();

          // 스크롤 잠금
          lockBodyScroll();
        }
      });
    },
    {
      threshold: 0.3, // 섹션이 30% 보일 때 트리거
    }
  );

  bodySectionObserver.observe(bodySection);
}

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", function () {
  initBodyImageReset();
});

// File 이미지 클릭 시 해당 오버레이 표시
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

// They.png 스크롤 애니메이션
function initTheyAnimation() {
  const theyImg = document.querySelector(".they-img-2");
  if (!theyImg) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // 화면에 보이면 애니메이션 실행
          setTimeout(() => {
            theyImg.classList.add("animate");
          }, 200); // 0.2초 지연
        } else {
          // 화면에서 벗어나면 애니메이션 초기화
          theyImg.classList.remove("animate");
        }
      });
    },
    {
      threshold: 0.3, // 30% 보일 때 트리거
      rootMargin: "0px 0px -100px 0px", // 아래쪽 100px 여유
    }
  );

  observer.observe(theyImg);
}

// Body 섹션 랜덤 텍스트 이미지들
const bodyRandomTextImages = [
  "text1.png",
  "text2.png",
  "text3.png",
  "text4.png",
  "text5.png",
  "text6.png",
  "text7.png",
  "text8.png",
  "text9.png",
  "text10.png",
  "text11.png",
  "text12.png",
  "text13.png",
  "text14.png",
  "text15.png",
  "text16.png",
  "text17.png",
  "text18.png",
  "text19.png",
  "text20.png",
];

// Body 섹션 랜덤 텍스트 생성 및 표시
let bodyTextInterval = null;

function initBodyRandomTexts() {
  const bodySection = document.getElementById("body-section");
  const randomTextsContainer = document.getElementById("body-random-texts");

  if (!bodySection || !randomTextsContainer) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // 섹션이 보일 때 랜덤 텍스트들 표시 시작
          startBodyRandomTexts();
        } else {
          // 섹션에서 벗어나면 텍스트들 숨기기 및 인터벌 정리
          stopBodyRandomTexts();
        }
      });
    },
    {
      threshold: 0.3,
    }
  );

  observer.observe(bodySection);
}

function startBodyRandomTexts() {
  // 기존 인터벌 정리
  if (bodyTextInterval) {
    clearInterval(bodyTextInterval);
    bodyTextInterval = null;
  }

  // 1초 지연 후 첫 번째 텍스트 세트 표시
  setTimeout(() => {
    showBodyRandomTexts();

    // 첫 번째 표시 후 5-8초 간격으로 텍스트 교체
    bodyTextInterval = setInterval(() => {
      showBodyRandomTexts();
    }, Math.random() * 3000 + 5000); // 5-8초 랜덤 간격
  }, 1000);
}

function stopBodyRandomTexts() {
  // 인터벌 정리
  if (bodyTextInterval) {
    clearInterval(bodyTextInterval);
    bodyTextInterval = null;
  }

  // 텍스트들 숨기기
  hideBodyRandomTexts();
}

function showBodyRandomTexts() {
  const randomTextsContainer = document.getElementById("body-random-texts");
  if (!randomTextsContainer) return;

  // 기존 텍스트들이 있다면 먼저 숨기기
  const existingTexts =
    randomTextsContainer.querySelectorAll(".body-random-text");
  existingTexts.forEach((text) => {
    text.classList.remove("show");
  });

  // 기존 텍스트들이 사라진 후 새로운 텍스트들 생성
  setTimeout(() => {
    // 기존 텍스트들 완전히 제거
    randomTextsContainer.innerHTML = "";

    // 5~10개의 랜덤 텍스트 이미지 선택
    const numTexts = Math.floor(Math.random() * 6) + 5; // 5~10개
    const shuffledImages = [...bodyRandomTextImages].sort(
      () => Math.random() - 0.5
    );
    const selectedImages = shuffledImages.slice(0, numTexts);

    // body.png가 있는 중앙 영역을 피해서 텍스트 배치
    const bodyImg = document.querySelector(".body-img");
    if (!bodyImg) return;

    const bodyRect = bodyImg.getBoundingClientRect();
    const containerRect = randomTextsContainer.getBoundingClientRect();

    // body.png의 중앙 영역 계산 (상대적 위치)
    const bodyCenterX =
      ((bodyRect.left - containerRect.left + bodyRect.width / 2) /
        containerRect.width) *
      100;
    const bodyCenterY =
      ((bodyRect.top - containerRect.top + bodyRect.height / 2) /
        containerRect.height) *
      100;
    const bodyWidth = (bodyRect.width / containerRect.width) * 100;
    const bodyHeight = (bodyRect.height / containerRect.height) * 100;

    // 중앙 영역을 피하는 범위 설정 (shoulder 영역은 텍스트가 나올 수 있도록 범위 축소)
    const avoidZone = {
      left: Math.max(0, bodyCenterX - bodyWidth * 0.4),
      right: Math.min(100, bodyCenterX + bodyWidth * 0.4),
      top: Math.max(0, bodyCenterY - bodyHeight * 0.3),
      bottom: Math.min(100, bodyCenterY + bodyHeight * 0.4),
    };

    // 화면 경계 내에서만 텍스트 배치 (shoulder 이미지 영역 포함)
    const safeZone = {
      left: 0, // 왼쪽 여백 없음
      right: 100, // 오른쪽 여백 없음
      top: 0, // 위쪽 여백 없음 (shoulder 영역 포함)
      bottom: 100, // 아래쪽 여백 없음
    };

    selectedImages.forEach((imageName, index) => {
      const textElement = document.createElement("img");
      textElement.className = "body-random-text";
      textElement.src = "IMG/" + imageName;
      textElement.alt = "Random text image";

      // 랜덤 크기 설정 (너무 크지 않게)
      const randomScale = Math.random() * 0.4 + 0.7; // 0.7 ~ 1.1 사이의 랜덤 크기
      const randomWidth = Math.random() * 4 + 6; // 6vw ~ 10vw 사이의 랜덤 너비
      const randomHeight = Math.random() * 3 + 5; // 5vh ~ 8vh 사이의 랜덤 높이

      textElement.style.maxWidth = randomWidth + "vw";
      textElement.style.maxHeight = randomHeight + "vh";
      textElement.style.transform = `scale(${randomScale})`;

      // 중앙 영역과 화면 경계를 피해서 랜덤 위치 생성
      let x, y;
      let attempts = 0;
      do {
        x = Math.random() * (safeZone.right - safeZone.left) + safeZone.left;
        y = Math.random() * (safeZone.bottom - safeZone.top) + safeZone.top;
        attempts++;
      } while (
        attempts < 50 &&
        x >= avoidZone.left &&
        x <= avoidZone.right &&
        y >= avoidZone.top &&
        y <= avoidZone.bottom
      );

      textElement.style.left = x + "%";
      textElement.style.top = y + "%";

      // 각 이미지마다 다른 애니메이션 지연
      textElement.style.animationDelay = index * 0.2 + "s";

      randomTextsContainer.appendChild(textElement);

      // 순차적으로 나타나도록
      setTimeout(() => {
        textElement.classList.add("show");
      }, index * 200);
    });
  }, 500); // 0.5초 후 새로운 텍스트들 생성
}

function hideBodyRandomTexts() {
  const randomTextsContainer = document.getElementById("body-random-texts");
  if (!randomTextsContainer) return;

  // 인터벌 정리
  if (bodyTextInterval) {
    clearInterval(bodyTextInterval);
    bodyTextInterval = null;
  }

  // 모든 텍스트 요소들 제거
  randomTextsContainer.innerHTML = "";
}

// Body 이미지들 팝업 애니메이션
function initBodyImagePopups() {
  const bodyImages = [
    ".shoulder1-img",
    ".shoulder2-img",
    ".shoulder3-img",
    ".stomac1-img",
    ".stomac2-img",
    ".leg1-img",
    ".leg2-img",
    ".leg3-img",
  ];

  // 각 이미지의 순서별 지연 시간 (밀리초)
  const delays = [0, 200, 400, 600, 800, 1000, 1200, 1400]; // 0.2초씩 증가

  bodyImages.forEach((selector, index) => {
    const img = document.querySelector(selector);
    if (!img) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 지정된 순서대로 지연 시간 적용
            setTimeout(() => {
              img.classList.add("popup");
            }, delays[index]);
          } else {
            // 화면에서 벗어나면 애니메이션 초기화
            img.classList.remove("popup");
          }
        });
      },
      {
        threshold: 0.2, // 20% 보일 때 트리거
        rootMargin: "0px 0px -50px 0px", // 아래쪽 50px 여유
      }
    );

    observer.observe(img);
  });
}

// Chang 이미지 스크롤 애니메이션
function initChangAnimation() {
  const changImg = document.querySelector(".chang-img");
  if (!changImg) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // 화면에 보이면 애니메이션 실행
          setTimeout(() => {
            changImg.classList.add("animate");
          }, 200); // 0.2초 지연
        } else {
          // 화면에서 벗어나면 애니메이션 초기화
          changImg.classList.remove("animate");
        }
      });
    },
    {
      threshold: 0.3, // 30% 보일 때 트리거
      rootMargin: "0px 0px -100px 0px", // 아래쪽 100px 여유
    }
  );

  observer.observe(changImg);
}

// Line 이미지 토글 기능
function toggleLine() {
  const lineImg = document.getElementById("line-img");
  const line2Img = document.getElementById("line2-img");
  const pointImg = document.querySelector(".point-img");

  if (lineImg && line2Img) {
    // 현재 상태 확인
    const isLine2Visible = line2Img.classList.contains("show");

    if (isLine2Visible) {
      // line2가 보이는 상태면 line으로 되돌리기
      line2Img.classList.remove("show");
      lineImg.style.opacity = "1";
      if (pointImg) {
        pointImg.style.opacity = "1";
        pointImg.style.visibility = "visible";
      }
    } else {
      // line이 보이는 상태면 line2로 변경
      lineImg.style.opacity = "0";
      line2Img.classList.add("show");
      if (pointImg) {
        pointImg.style.opacity = "0";
        pointImg.style.visibility = "hidden";
      }
    }
  }
}

// Line 섹션 스크롤 감지하여 원상복구 및 오버레이 효과
function initLineReset() {
  const lineSection = document.getElementById("line-section");
  if (!lineSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // line 섹션이 보일 때 원상복구
          const lineImg = document.getElementById("line-img");
          const line2Img = document.getElementById("line2-img");
          const pointImg = document.querySelector(".point-img");
          const lineOverlay = document.getElementById("line-overlay");
          const interImg = document.getElementById("inter-img");

          if (lineImg && line2Img) {
            lineImg.style.opacity = "1";
            line2Img.classList.remove("show");
          }
          if (pointImg) {
            pointImg.style.opacity = "1";
            pointImg.style.visibility = "visible";
          }

          // 검정색 그라데이션 오버레이 표시
          if (lineOverlay) {
            lineOverlay.classList.add("show");
          }

          // inter.png 팝업 효과 (0.5초 지연)
          if (interImg) {
            setTimeout(() => {
              interImg.classList.add("show");
            }, 500);
          }
        } else {
          // 섹션에서 벗어나면 오버레이와 inter.png 숨기기
          const lineOverlay = document.getElementById("line-overlay");
          const interImg = document.getElementById("inter-img");

          if (lineOverlay) {
            lineOverlay.classList.remove("show");
          }
          if (interImg) {
            interImg.classList.remove("show");
          }
        }
      });
    },
    {
      threshold: 0.3,
    }
  );

  observer.observe(lineSection);
}

// Eye Modal 기능
function showEyeModal() {
  const eyeModal = document.getElementById("eye-modal-overlay");
  if (eyeModal) {
    eyeModal.classList.add("show");
    // q1 이미지부터 순차적으로 표시
    showModalImages();
  }
}

function hideEyeModal() {
  const eyeModal = document.getElementById("eye-modal-overlay");
  const healBackground = document.getElementById("heal-background");
  const apBackground = document.getElementById("ap-background");
  const zaBackground = document.getElementById("za-background");

  if (eyeModal) {
    eyeModal.classList.remove("show");
    // 모든 모달 이미지 숨기기
    const modalImages = document.querySelectorAll(".modal-img");
    modalImages.forEach((img) => {
      img.classList.remove("show");
    });
    // 모든 배경도 숨기기
    if (healBackground) {
      healBackground.classList.remove("show");
    }
    if (apBackground) {
      apBackground.classList.remove("show");
    }
    if (zaBackground) {
      zaBackground.classList.remove("show");
    }
  }
}

function showModalImages() {
  const images = ["q1", "a1", "a2", "a3", "a4"];
  let currentIndex = 0;

  function showNextImage() {
    if (currentIndex < images.length) {
      const img = document.querySelector(`.${images[currentIndex]}-img`);
      if (img) {
        img.classList.add("show");
        currentIndex++;
        // 0.6초 후 다음 이미지 표시 (기존 1초에서 단축)
        setTimeout(showNextImage, 600);
      }
    }
  }

  showNextImage();
}

function showHeal() {
  const healImg = document.querySelector(".heal-img");
  const healBackground = document.getElementById("heal-background");
  const apImg = document.querySelector(".ap-img");
  const apBackground = document.getElementById("ap-background");
  const zaImg = document.querySelector(".za-img");
  const zaBackground = document.getElementById("za-background");
  const eyeModal = document.getElementById("eye-modal-overlay");

  if (healImg && healBackground) {
    // 모달이 닫혀있다면 강제로 열기
    if (eyeModal && !eyeModal.classList.contains("show")) {
      eyeModal.classList.add("show");
    }

    // 다른 배경/이미지 숨김 처리로 충돌 방지
    if (apBackground) apBackground.classList.remove("show");
    if (zaBackground) zaBackground.classList.remove("show");
    if (apImg) apImg.classList.remove("show");
    if (zaImg) zaImg.classList.remove("show");

    // 먼저 그라데이션 배경 표시
    healBackground.classList.add("show");

    // 0.5초 후에 heal.png가 아래에서 위로 올라오도록
    setTimeout(() => {
      healImg.classList.add("show");
    }, 500);
  }
}

function showAp() {
  const healImg = document.querySelector(".heal-img");
  const healBackground = document.getElementById("heal-background");
  const apImg = document.querySelector(".ap-img");
  const apBackground = document.getElementById("ap-background");
  const zaImg = document.querySelector(".za-img");
  const zaBackground = document.getElementById("za-background");
  const eyeModal = document.getElementById("eye-modal-overlay");

  if (apImg && apBackground) {
    // 모달이 닫혀있다면 강제로 열기
    if (eyeModal && !eyeModal.classList.contains("show")) {
      eyeModal.classList.add("show");
    }

    // 다른 배경/이미지 숨김 처리로 충돌 방지
    if (healBackground) healBackground.classList.remove("show");
    if (zaBackground) zaBackground.classList.remove("show");
    if (healImg) healImg.classList.remove("show");
    if (zaImg) zaImg.classList.remove("show");

    // 먼저 그라데이션 배경 표시
    apBackground.classList.add("show");

    // 0.5초 후에 ap.png가 아래에서 위로 올라오도록
    setTimeout(() => {
      apImg.classList.add("show");
    }, 500);
  }
}

function showZa() {
  const zaImg = document.querySelector(".za-img");
  const zaBackground = document.getElementById("za-background");

  if (zaImg && zaBackground) {
    // 먼저 노란색 그라데이션 배경 표시
    zaBackground.classList.add("show");

    // 0.5초 후에 za.png가 아래에서 위로 올라오도록
    setTimeout(() => {
      zaImg.classList.add("show");
    }, 500);
  }
}

function goToLine() {
  // inter.png와 오버레이 숨기기
  const interImg = document.getElementById("inter-img");
  const lineOverlay = document.getElementById("line-overlay");

  if (interImg) {
    interImg.classList.remove("show");
  }
  if (lineOverlay) {
    lineOverlay.classList.remove("show");
  }
}

function goToLineFromModal() {
  // 모달 닫기
  hideEyeModal();

  // line.png로 되돌리기 (line2.png 숨기고 line.png 보이게)
  const lineImg = document.getElementById("line-img");
  const line2Img = document.getElementById("line2-img");
  const pointImg = document.querySelector(".point-img");

  if (lineImg && line2Img) {
    lineImg.style.opacity = "1";
    line2Img.classList.remove("show");
  }
  if (pointImg) {
    pointImg.style.opacity = "1";
    pointImg.style.visibility = "visible";
  }
}

// Fileback section animations
let macImagesShown = false;
let mac3Clicked = false;

function initFilebackAnimations() {
  const filebackSection = document.getElementById("fileback-section");

  if (!filebackSection) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !macImagesShown) {
          macImagesShown = true;
          showMacImages();
        } else if (!entry.isIntersecting && macImagesShown) {
          resetMacImages();
        }
      });
    },
    {
      threshold: 0.3,
    }
  );

  observer.observe(filebackSection);
}

function showMacImages() {
  // mac3.png 먼저 표시
  setTimeout(() => {
    const mac3 = document.getElementById("mac3-img");
    if (mac3) {
      mac3.classList.add("show");
    }
  }, 500);

  // mac4.png 표시
  setTimeout(() => {
    const mac4 = document.getElementById("mac4-img");
    if (mac4) {
      mac4.classList.add("show");
    }
  }, 1500);

  // mac5.png와 mac6.png 동시에 표시
  setTimeout(() => {
    const mac5 = document.getElementById("mac5-img");
    const mac6 = document.getElementById("mac6-img");
    if (mac5) {
      mac5.classList.add("show");
    }
    if (mac6) {
      mac6.classList.add("show");
    }
  }, 3500);
}

function showMac7And8() {
  const mac3 = document.getElementById("mac3-img");
  const mac7 = document.getElementById("mac7-img");
  const mac8 = document.getElementById("mac8-img");
  const mac3Text = document.querySelector(".mac3-text");

  if (!mac3 || !mac7 || !mac8) return;

  mac3Clicked = true;

  // mac3.png 숨기기
  mac3.classList.remove("show");

  // mac7.png 표시 (mac3 자리에)
  setTimeout(() => {
    mac7.classList.add("show");
  }, 300);

  // mac8.png로 바뀌기 (mac7 대신)
  setTimeout(() => {
    mac7.classList.remove("show");
    mac8.classList.add("show");

    // mac8이 표시될 때 텍스트도 함께 표시
    if (mac3Text) {
      mac3Text.style.opacity = "1";
      mac3Text.style.visibility = "visible";
    }
  }, 2000);
}

function resetMacImages() {
  const mac3 = document.getElementById("mac3-img");
  const mac7 = document.getElementById("mac7-img");
  const mac8 = document.getElementById("mac8-img");
  const mac3Text = document.querySelector(".mac3-text");

  if (!mac3 || !mac7 || !mac8) return;

  // 모든 mac 이미지 숨기기
  mac3.classList.remove("show");
  mac7.classList.remove("show");
  mac8.classList.remove("show");

  // 텍스트도 숨기기
  if (mac3Text) {
    mac3Text.style.opacity = "0";
    mac3Text.style.visibility = "hidden";
  }

  // mac3.png 다시 표시
  setTimeout(() => {
    mac3.classList.add("show");
  }, 100);

  // 플래그 리셋
  mac3Clicked = false;
  macImagesShown = false;
}

function completeText() {
  const nameInput = document.getElementById("tell-name-input");
  const textarea = document.querySelector(".tell-textarea");
  const name = nameInput ? nameInput.value.trim() : "";
  const text = textarea.value.trim();

  if (text === "") {
    alert("텍스트를 입력해주세요.");
    return;
  }

  if (name === "") {
    alert("이름을 입력해주세요.");
    return;
  }

  // 현재 날짜와 시간
  const now = new Date();
  const dateStr = now.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // 고유 ID 생성
  const itemId = Date.now();

  // 로컬 스토리지에 저장
  saveToLocalStorage(text, dateStr, itemId, name);

  // 입력 필드 초기화
  if (nameInput) nameInput.value = "";
  textarea.value = "";

  // 첫 페이지로 이동하여 새 항목 표시
  currentPage = 1;
  renderPage(1);

  // tellfile 섹션으로 스크롤
  const tellfileSection = document.getElementById("tellfile-section");
  if (tellfileSection) {
    tellfileSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

// 방명록 항목 생성 함수
function createTellfileItem(text, dateStr, itemId, name) {
  const item = document.createElement("div");
  item.className = "tellfile-item";
  item.dataset.id = itemId;

  // 안전하게 텍스트 이스케이프
  const safeName = (name || "익명").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeDate = dateStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 폴더 아이콘
  const folderIcon = document.createElement("div");
  folderIcon.className = "tellfile-folder-icon";
  folderIcon.title = "클릭하여 내용 보기";
  folderIcon.onclick = (e) => {
    e.stopPropagation();
    openTellfileModal(text, dateStr, name || "익명");
  };

  // 이름 (표시만)
  const nameElement = document.createElement("div");
  nameElement.className = "tellfile-item-name";
  nameElement.textContent = safeName;

  // 날짜
  const dateElement = document.createElement("p");
  dateElement.className = "tellfile-item-date";
  dateElement.textContent = safeDate;

  // 삭제 버튼
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "tellfile-delete-btn";
  deleteBtn.textContent = "×";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deleteTellfileItem(itemId);
  };

  item.appendChild(folderIcon);
  item.appendChild(nameElement);
  item.appendChild(dateElement);
  item.appendChild(deleteBtn);

  return item;
}

// 방명록 항목 삭제 함수
function deleteTellfileItem(itemId) {
  const item = document.querySelector(`.tellfile-item[data-id="${itemId}"]`);
  if (item) {
    // 페이드아웃 애니메이션
    item.style.opacity = "0";
    item.style.transform = "translateX(-20px)";

    setTimeout(() => {
      // 로컬 스토리지에서 삭제
      deleteFromLocalStorage(itemId);

      // 현재 페이지 다시 렌더링
      const messages = JSON.parse(
        localStorage.getItem("tellfileMessages") || "[]"
      );
      const totalPages = Math.ceil(messages.length / itemsPerPage);

      // 현재 페이지가 없어졌으면 이전 페이지로
      if (currentPage > totalPages && currentPage > 1) {
        currentPage = totalPages;
      }

      renderPage(currentPage);
    }, 300);
  }
}

// 로컬 스토리지에서 삭제
function deleteFromLocalStorage(itemId) {
  let messages = JSON.parse(localStorage.getItem("tellfileMessages") || "[]");
  messages = messages.filter((msg) => msg.id !== itemId);
  localStorage.setItem("tellfileMessages", JSON.stringify(messages));
}

// 로컬 스토리지에 저장
function saveToLocalStorage(text, date, id, name) {
  let messages = JSON.parse(localStorage.getItem("tellfileMessages") || "[]");
  messages.unshift({ text, date, id, name: name || "익명" });
  // 최대 50개까지만 저장
  if (messages.length > 50) {
    messages = messages.slice(0, 50);
  }
  localStorage.setItem("tellfileMessages", JSON.stringify(messages));
}

// 페이지네이션 변수
let currentPage = 1;
const itemsPerPage = 18; // 6개 × 3줄

// 페이지 렌더링
function renderPage(page) {
  const messages = JSON.parse(localStorage.getItem("tellfileMessages") || "[]");
  const tellfileList = document.getElementById("tellfile-list");

  if (!tellfileList) return;

  // 리스트 초기화
  tellfileList.innerHTML = "";

  // 현재 페이지의 항목들만 표시
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageMessages = messages.slice(startIndex, endIndex);

  pageMessages.forEach(({ text, date, id, name }) => {
    const item = createTellfileItem(text, date, id, name);
    tellfileList.appendChild(item);
  });

  // 페이지네이션 업데이트
  renderPagination(messages.length, page);
}

// 페이지네이션 렌더링
function renderPagination(totalItems, currentPage) {
  const pagination = document.getElementById("tellfile-pagination");
  if (!pagination) return;

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 18개 미만이면 페이지네이션 숨기기
  if (totalItems <= itemsPerPage) {
    pagination.innerHTML = "";
    return;
  }

  pagination.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement("div");
    pageBtn.className = "page-number" + (i === currentPage ? " active" : "");
    pageBtn.textContent = i;
    pageBtn.onclick = () => goToPage(i);
    pagination.appendChild(pageBtn);
  }
}

// 페이지 이동
function goToPage(page) {
  currentPage = page;
  renderPage(page);
}

// 폴더 모달 열기
function openTellfileModal(text, dateStr, name) {
  const modal = document.getElementById("tellfile-modal-overlay");
  const modalText = document.getElementById("tellfile-modal-text");
  const modalDate = document.getElementById("tellfile-modal-date");
  const modalName = document.getElementById("tellfile-modal-name");

  if (modal && modalText && modalDate) {
    modalText.textContent = text;
    modalDate.textContent = dateStr;
    if (modalName) {
      modalName.textContent = name || "익명";
    }
    modal.classList.add("show");
  }
}

// 폴더 모달 닫기
function closeTellfileModal() {
  const modal = document.getElementById("tellfile-modal-overlay");
  if (modal) {
    modal.classList.remove("show");
  }
}

// 모달 배경 클릭 시 닫기
document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("tellfile-modal-overlay");
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        closeTellfileModal();
      }
    });
  }
});

// ESC 키로 모달 닫기
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeTellfileModal();
  }
});

// 랜덤 말풍선 메시지 배열
const speechBubbleMessages = [
  "요즘 살쪘어?",
  "어디 아파 보여.",
  "너 왜 이렇게 창백해?",
  "오늘은 부어 보이네.",
  "그나마 너는 얼굴이 작아서 다행이다.",
  "그래도 말라서 옷빨은 잘 받는다.",
  "그 몸에 그 정도면 괜찮지.",
  "살 빼니까 사람 됐네.",
  "너도 관리하면 예뻐질 수 있어.",
  "그 스타일은 마른 사람이 입어야 예쁘지.",
  "살만 좀 더 빼면 진짜 모델 같겠다.",
  "아깝다… 얼굴은 예쁜데 몸이 좀…",
  "그래도 너는 비율은 좋잖아.",
  "나는 그런 체형은 좀 안 예뻐 보이던데…",
  "그건 네가 말라서 그래.",
  "넌 살 안 찌는 체질이라 좋겠다. 부럽다~",
  "난 다이어트 하려고~",
  "그 머리는 얼굴 작아야 어울려.",
  "운동 좀 해야겠다.",
  "그런 옷은 마른애들이 입어야 할듯 ㅋㅋ",
  "걔는 진짜 딱 예쁜 몸매야.",
  "그 연예인처럼 마르면 진짜 예쁠 텐데.",
  "걔는 아무거나 입어도 예뻐.",
  "살 찌니까 맞는 옷이 없어..",
  "쟤는 관리 안 하면 금방 망가질 상이야.",
  "SNS에 올라온 애들은 다 말랐더라.",
];

// 랜덤 말풍선 표시 함수
function showRandomSpeechBubble() {
  // 사용 가능한 말풍선 ID들
  const bubbleIds = [
    "speech-bubble-1",
    "speech-bubble-2",
    "speech-bubble-3",
    "speech-bubble-4",
    "speech-bubble-5",
  ];

  // 현재 사용 가능한 말풍선만 필터링 (이미 표시 중인 것 제외)
  const availableBubbles = bubbleIds.filter((bubbleId) => {
    const speechBubble = document.getElementById(bubbleId);
    return speechBubble && !speechBubble.classList.contains("show");
  });

  if (availableBubbles.length === 0) return; // 사용 가능한 말풍선이 없으면 종료

  // 1-3개의 말풍선을 랜덤하게 선택 (더 적은 수로 변경하여 비규칙성 증가)
  const numBubbles = Math.min(
    Math.floor(Math.random() * 3) + 1, // 1-3개
    availableBubbles.length
  );
  const shuffledIds = [...availableBubbles].sort(() => Math.random() - 0.5);
  const selectedIds = shuffledIds.slice(0, numBubbles);

  selectedIds.forEach((bubbleId) => {
    const speechBubble = document.getElementById(bubbleId);
    if (!speechBubble) return;

    // 랜덤 메시지 선택
    const randomMessage =
      speechBubbleMessages[
        Math.floor(Math.random() * speechBubbleMessages.length)
      ];

    // 랜덤 위치 설정 (화면 전체를 활용)
    const heroContent = document.querySelector(".hero-content");
    if (heroContent) {
      // 랜덤 위치 (10% ~ 90% 범위)
      const randomLeft = Math.random() * 0.8 + 0.1; // 10% ~ 90%
      const randomTop = Math.random() * 0.8 + 0.1; // 10% ~ 90%

      speechBubble.style.left = randomLeft * 100 + "%";
      speechBubble.style.top = randomTop * 100 + "%";
      // transform은 CSS 애니메이션에서 관리
    }

    // 말풍선에 메시지 설정
    speechBubble.textContent = randomMessage;

    // 각 말풍선마다 다른 타이밍에 표시 (0 ~ 1.5초 랜덤 지연)
    const showDelay = Math.random() * 1500;

    setTimeout(() => {
      // 말풍선이 아직 다른 곳에서 사용되지 않았는지 확인
      if (!speechBubble.classList.contains("show")) {
        // 말풍선 표시
        speechBubble.classList.add("show");

        // 각 말풍선마다 랜덤한 시간 후 숨기기 (1.5초 ~ 4초)
        const hideDelay = Math.random() * 2500 + 1500; // 1.5초 ~ 4초

        setTimeout(() => {
          // 부드러운 페이드아웃: 잠깐 hide를 적용해 투명도로 사라지게
          speechBubble.classList.add("hide");
          // 페이드아웃 완료 후 상태 초기화
          setTimeout(() => {
            speechBubble.classList.remove("show", "hide");
          }, 400);
        }, hideDelay);
      }
    }, showDelay);
  });
}

// 페이지 로드 시 랜덤 말풍선 시작
document.addEventListener("DOMContentLoaded", function () {
  // 첫 번째 말풍선은 0.5-1.5초 랜덤 시간 후에 표시
  const firstDelay = Math.random() * 1000 + 500;
  setTimeout(() => {
    showRandomSpeechBubble();
    scheduleNextBubble(); // 다음 말풍선 예약 시작
  }, firstDelay);

  // 그 다음부터는 1-5초 간격으로 랜덤 표시 (더 불규칙하게)
  function scheduleNextBubble() {
    const randomDelay = Math.random() * 4000 + 1000; // 1-5초 랜덤
    setTimeout(() => {
      showRandomSpeechBubble();
      scheduleNextBubble(); // 다음 말풍선 예약
    }, randomDelay);
  }
});

// 홈으로 스크롤하는 함수
function scrollToHome() {
  const homeSection = document.querySelector(".background-image");
  if (homeSection) {
    homeSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

// 홈 버튼 표시/숨김 함수
function toggleHomeButton() {
  const homeButton = document.getElementById("home-button");
  if (!homeButton) return;

  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // 홈 섹션을 벗어나면 버튼 표시
  if (scrollTop > 100) {
    homeButton.classList.add("show");
  } else {
    homeButton.classList.remove("show");
  }
}

// 스크롤 이벤트 리스너 추가
window.addEventListener("scroll", toggleHomeButton);

// 페이지 로드 시 저장된 메시지 불러오기
function loadMessages() {
  renderPage(1);
}

function showLine() {
  // 모달은 닫지 않고 q1, a1~a4.png가 있는 상태로 되돌리기
  const q1Img = document.querySelector(".q1-img");
  const a1Img = document.querySelector(".a1-img");
  const a2Img = document.querySelector(".a2-img");
  const a3Img = document.querySelector(".a3-img");
  const a4Img = document.querySelector(".a4-img");
  const healImg = document.querySelector(".heal-img");
  const apImg = document.querySelector(".ap-img");
  const zaImg = document.querySelector(".za-img");
  const healBackground = document.getElementById("heal-background");
  const apBackground = document.getElementById("ap-background");
  const zaBackground = document.getElementById("za-background");

  // q1, a1~a4는 보이게
  if (q1Img) q1Img.classList.add("show");
  if (a1Img) a1Img.classList.add("show");
  if (a2Img) a2Img.classList.add("show");
  if (a3Img) a3Img.classList.add("show");
  if (a4Img) a4Img.classList.add("show");

  // heal, ap, za와 배경들은 숨기기
  if (healImg) healImg.classList.remove("show");
  if (apImg) apImg.classList.remove("show");
  if (zaImg) zaImg.classList.remove("show");
  if (healBackground) healBackground.classList.remove("show");
  if (apBackground) apBackground.classList.remove("show");
  if (zaBackground) zaBackground.classList.remove("show");
}

// 모달 외부 클릭 시 닫기
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("eye-modal-overlay")) {
    hideEyeModal();
  }
});

// ESC 키로 모달 닫기
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    hideEyeModal();
  }
});

// City 배경 애니메이션 초기화
function initCityAnimation() {
  const cityImg = document.querySelector(".city-bg-img");
  const cityGradient = document.querySelector(".city-gradient-overlay");

  if (!cityImg) return;

  // 페이지 로드 후 1.5초 지연 후 city.png와 그라데이션이 위로 떠오르도록
  setTimeout(() => {
    cityImg.classList.add("animate");
    if (cityGradient) cityGradient.classList.add("animate");
  }, 1500);
}

// Start 버튼 클릭 시 다음 섹션으로 스크롤
function initStartButton() {
  const startButton = document.querySelector(".start-button");
  if (!startButton) return;

  startButton.addEventListener("click", () => {
    const googleSection = document.querySelector("#google-section");
    if (googleSection) {
      googleSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
}

// Eyeback 배경 이미지 애니메이션
function initEyebackAnimation() {
  const blackSection = document.getElementById("black-section");
  if (!blackSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const eyebackImgs = blackSection.querySelectorAll(".eyeback-bg");

          // 각 eyeback 이미지를 순차적으로 나타나도록
          eyebackImgs.forEach((img, index) => {
            setTimeout(() => {
              img.classList.add("animate");
            }, 300 + index * 200); // 0.2초씩 지연
          });
        } else {
          // 섹션에서 벗어나면 애니메이션 초기화
          const eyebackImgs = blackSection.querySelectorAll(".eyeback-bg");
          eyebackImgs.forEach((img) => {
            img.classList.remove("animate");
          });
        }
      });
    },
    {
      threshold: 0.3,
    }
  );

  observer.observe(blackSection);
}

// 스크롤 인디케이터 초기화
function initScrollIndicator() {
  const items = document.querySelectorAll(".scroll-indicator-item");

  // 모든 섹션 수집
  const allSections = [];
  const sectionToItemMap = new Map();

  items.forEach((item) => {
    const sectionIds = item.dataset.sections.split(",");
    sectionIds.forEach((sectionId) => {
      const section =
        document.querySelector(`#${sectionId}`) ||
        document.querySelector(`.${sectionId}`);
      if (section) {
        allSections.push(section);
        sectionToItemMap.set(section, item);
      }
    });
  });

  // IntersectionObserver로 현재 섹션 감지
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const item = sectionToItemMap.get(entry.target);

          if (item) {
            // 모든 item 비활성화
            items.forEach((i) => i.classList.remove("active"));

            // 현재 섹션의 item 활성화
            item.classList.add("active");
          }
        }
      });
    },
    {
      threshold: 0.3,
      rootMargin: "-20% 0px -20% 0px",
    }
  );

  allSections.forEach((section) => observer.observe(section));

  // item 클릭 시 첫 번째 섹션의 '첫 이미지'가 뷰포트 중앙에 오도록 스크롤
  items.forEach((item) => {
    item.addEventListener("click", () => {
      const sectionIds = item.dataset.sections.split(",");
      const firstSectionId = sectionIds[0];
      const section =
        document.querySelector(`#${firstSectionId}`) ||
        document.querySelector(`.${firstSectionId}`);

      if (section) {
        // 첫 번째 What(black-section) 예외 처리: eyeback.png 중앙 정렬
        if (firstSectionId === "black-section") {
          const eyeBackImg = section.querySelector(".eyeback-img");
          if (eyeBackImg) {
            const rect = eyeBackImg.getBoundingClientRect();
            const imgCenterY = rect.top + window.scrollY + rect.height / 2;
            const targetY = Math.max(0, imgCenterY - window.innerHeight / 2);

            if (window.lenis && typeof window.lenis.scrollTo === "function") {
              window.lenis.scrollTo(targetY, { duration: 1 });
            } else {
              window.scrollTo({ top: targetY, behavior: "smooth" });
            }
            return; // 처리 후 종료
          }
        }

        const firstImg = section.querySelector("img");
        if (firstImg) {
          const rect = firstImg.getBoundingClientRect();
          const imgCenterY = rect.top + window.scrollY + rect.height / 2;
          const targetY = Math.max(0, imgCenterY - window.innerHeight / 2);

          if (window.lenis && typeof window.lenis.scrollTo === "function") {
            window.lenis.scrollTo(targetY, { duration: 1 });
          } else {
            window.scrollTo({ top: targetY, behavior: "smooth" });
          }
        } else {
          // 이미지가 없으면 섹션 시작으로 스크롤
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });
}

// 페이지 로드 시 애니메이션 초기화
document.addEventListener("DOMContentLoaded", function () {
  initCityAnimation();
  initStartButton();
  initTheyAnimation();
  initBodyImagePopups();
  initBodyRandomTexts(); // Body 섹션 랜덤 텍스트 초기화
  initChangAnimation();
  initLineReset();
  initEyebackAnimation();
  loadMessages(); // 저장된 메시지 불러오기
  initScrollIndicator(); // 스크롤 인디케이터 초기화

  // Initialize fileback section animations
  initFilebackAnimations();
});
