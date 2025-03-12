window.addEventListener("message",  (event) => {
  if (event.data.type === "CONTENT") {
    console.log("MAIN SCRIPT CONTENT")
    switch (event.data.message) {
      case "GETTOKEN":
        var header: HTMLElement | null = document.querySelector(
        "#root > div.layout > div.header"
        );
        const headerR: any = FindReact(header);
        if (headerR) {
          window.postMessage({
            type: "MAIN",
            message: "SENDTOKEN",
            keyMessage:event.data.keyMessage,
            data:headerR.props.currentUser.tokenFe
          });
        }
        break;

      case "ADDCODE":
        const searchButton: HTMLElement | null = document.querySelector(
          "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
        );
        const root: HTMLElement | null =
          document.querySelector("div.MuiDialog-root");
        const rootReact: any = FindReact(root, 5);
        if (!rootReact) {
          console.log("loi");
          return;
        }
        rootReact.setState({ keyword: event.data.data });
        if (searchButton) {
          searchButton?.click();
        }
        break;
        case "CHANGEDICHVU":
          var form: HTMLElement | null = document.querySelector(
            "#content > div > div > div.sub-content.multiple-item-no-footer > form"
          );
          const formDichVuR: any = FindReact(form);
  
          formDichVuR.setState({
            formValue: { ...formDichVuR.state.formValue, serviceCode: event.data.dichvu },
          });
          break;

      case "ADDWEIGHT":
        var form: HTMLElement | null = document.querySelector(
          "#content > div > div > div.sub-content.multiple-item-no-footer > form"
        );
        const formR: any = FindReact(form);
        //change "5000" to "5.000"
        var klTemp =event.data.kl.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1.')

        formR.setState({
          formValue: { ...formR.state.formValue, weight: klTemp },
        });
        break;

      case "ADDKICHTHUOC":
        var form3: HTMLElement | null = document.querySelector(
          "#content > div > div > div.sub-content.multiple-item-no-footer > form"
        );
        const formR3: any = FindReact(form3);
        //change "5000" to "5.000"

        formR3.setState({
          formValue: { ...formR3.state.formValue, widthSize: event.data.kt[0],lengthSize:event.data.kt[1],heightSize:event.data.kt[2] },
        });
        break;
      case "ADDLOGIN":
        var formLogin: HTMLElement | null = document.querySelector(
          "#content > div.login-form"
        );
        const formLoginR: any = FindReact(formLogin);
        console.log("ADDLOGIN")
        if (formLoginR) {
          var eventInput = new Event('input', { bubbles: true });
          debugger;
          const user: HTMLInputElement|null = document.querySelector("#username")
          user!.value = event.data.account
          user!.dispatchEvent(eventInput);
          const password: HTMLInputElement|null = document.querySelector("#password")
          password!.value = event.data.password
          password!.dispatchEvent(eventInput);

          //insert 'dfdf' into input with id username
          formLoginR.setState({
            // username: "593200_xonld",
            username: event.data.account,
            // password: "Bc@0901124399",
            password: event.data.password,
          });
          formLoginR.forceUpdate()
          var loginBtn = document.querySelector(
            "#formLogin > div.MuiGrid-root.MuiGrid-container > button"
          ) as HTMLButtonElement;
          loginBtn?.click();
        }
        break;
      case "ADDTIMKIEMTEXT":
        var form1 :HTMLInputElement|null= document.querySelector(
          "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form"
        );
     
        //active form1

        const formR1: any = FindReact(form1);

        formR1.setState({
          formValue: {
            ...formR1.state.formValue,
            customerCode: event.data.data,
          },
        });
        formR1.forceUpdate();

        break;
        case "ADDADDRESSTEXT":
        var form2 :HTMLInputElement|null= document.querySelector(
          "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form"
        );
     
        //active form1

        const formR2: any = FindReact(form2);

        formR2.setState({
          formValue: {
            ...formR2.state.formValue,
            customerAddress: event.data.data,
          },
        });

        formR2.forceUpdate();

        break;
        case "GETIDKH":
          var c = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form")
          var c1 = FindReact(c)
          var id = c1.props.itemHdrId
          window.postMessage({
            type: "MAIN",
            message: "GETIDKH",
            data:id
          });

          break;


      default:
        break;
    }
  }
});

function FindReact(dom: any, traverseUp: number = 0): any {
  const key = Object.keys(dom).find((key: string) => {
    return (
      key.startsWith("__reactFiber$") || // react 17+
      key.startsWith("__reactInternalInstance$")
    ); // react <17
  });

  const domFiber = dom[key!];
  if (domFiber == null) return null; // react <16
  if (domFiber._currentElement) {
    let compFiber = domFiber._currentElement._owner;
    for (let i = 0; i < traverseUp; i++) {
      compFiber = compFiber._currentElement._owner;
    }
    return compFiber._instance;
  } // react 16+
  const GetCompFiber = (fiber: any) => {
    //return fiber._debugOwner; // this also works, but is __DEV__ only
    let parentFiber = fiber.return;
    while (typeof parentFiber.type == "string") {
      parentFiber = parentFiber.return;
    }
    return parentFiber;
  };
  let compFiber = GetCompFiber(domFiber);
  for (let i = 0; i < traverseUp; i++) {
    compFiber = GetCompFiber(compFiber);
  }
  return compFiber.stateNode;
}

window.postMessage({ type: "MAIN", message: "", data: "" }, "/");
console.log("run");
