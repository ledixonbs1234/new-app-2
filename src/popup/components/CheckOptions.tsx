import { useEffect, useState } from "react";
import { Checkbox,  GetProp } from "antd";
import { useDispatch } from "react-redux";
import { setCheckChange } from "../popup.slice";
interface CheckOptionProps {
  checkOptions?: {
    countDangGom: number;
    countPhanHuong: number;
    countNhanHang: number;
    countChapNhan: number;
  };
}
 interface CheckProps{
  value:number,
  label:string
}
const CheckOptions = ({ checkOptions }: CheckOptionProps) => {
  const dispatch = useDispatch()
  const [plainOptions, setPlainOptions] = useState<CheckProps[]>([
    {label:"Đang Gom[10]",value:0},
    {label:"Phân Hướng[0]",value:1},
    {label:"Nhận Hàng[0]",value:2},
    {label:" Chấp Nhận[0]",value:3},
  ]);
  type CheckboxValueType = GetProp<typeof Checkbox.Group, "value">[number];
  const [checkedList, setCheckedList] =
    useState<CheckboxValueType[]>([0,1,2]);
  useEffect(() => {
    setPlainOptions([
      {label:`Đang Gom [${checkOptions?.countDangGom}]`,value:0},
      {label:`Phân Hướng [${checkOptions?.countPhanHuong}]`,value:1},
      {label:`Nhận Hàng [${checkOptions?.countNhanHang}]`,value:2},
      {label:`Chấp Nhận [${checkOptions?.countChapNhan}]`,value:3},
    ]);
    setCheckedList([0,1,2])
  }, [checkOptions]);
  const onChange = (list: CheckboxValueType[]) => {
    console.log(list)
    setCheckedList(list);
    dispatch(setCheckChange(list as number[]))
  };

  //   const onCheckAllChange: CheckboxProps["onChange"] = (e) => {
  //     setCheckedList(e.target.checked ? plainOptions : []);
  //   };
  return (
    <>
      <Checkbox.Group className="" options={plainOptions} onChange={onChange} value={checkedList}>
      </Checkbox.Group>
    </>
  );
};

export default CheckOptions;
